# Leadfinder

A local prospecting app for a marketing agency that sells to home-service businesses (flooring and concrete, painting, fencing, movers). It finds the businesses in a market, works out which ones are worth calling, and tells you what to pitch each one.

It runs on your own machine, with your own Apify and OpenRouter keys. There is no login and no hosted backend, so don't expose it to the internet.

## What it does

1. **Define a niche.** Start from a preset or from scratch. A niche holds a playbook: which Google Maps categories and keywords count as a target, which chains to exclude, and how to weight each offer.
2. **Draw areas.** Mark a service area on a map as a radius or a polygon. The app lays out the search grid and shows the number of search points, the estimated run time and the estimated cost before anything is spent.
3. **Launch a run.** After you confirm the estimate, a Google Maps scrape starts on Apify with a hard per-run cost cap. Results are fetched, normalized and deduplicated into one local database.
4. **Review prospects.** A sortable, filterable table (and a map) of everything found, each with a score, a lead offer and a runner-up. Open a business to see exactly why it scored the way it did.
5. **Enrich.** Three ways, from free to paid. "Enrich" on the table runs any of them over the best-scoring prospects the table is showing, after a cost confirmation, and the buttons on a business's page do one business.
   - **Quick scan (free):** reads the business's own website with plain HTTP, no AI. It finds social links (and links the Facebook page), emails, phone numbers, the About and Contact pages, a founder named in the site's structured data, and signals that feed the offer scores: no mobile site, no contact form or chat, a stale footer, a Facebook Pixel, a DIY site builder, or a site that doesn't load. It also records why a site couldn't be read (JavaScript-built, blocked, dead).
   - **Web search (about a tenth of a cent):** googles for the owner and has your OpenRouter model read the results. It only accepts a name that a result states in its own text, and shows the quotes and sources so you can judge it.
   - **Paid website reader (about $0.015):** the second pass for sites the quick scan can't read. It also gets emails, phones and services.

   The quick scan also runs on its own: when a Maps run finishes, the new places' websites are scanned in the background (the run list shows the progress), so a fresh run arrives already scored with the site signals. Only the free scan is automatic. Searches and the paid reader are always your click, and sites the scan couldn't read are just flagged. Set `AUTO_SCAN_ON_INGEST=0` to turn it off.

   Each can fall back to the next: sites the scan can't read can go to the paid reader, and businesses the search can't name can have their website read. The owner shows in the table, on the business page, and in the pitch brief ("Ask for …").
6. **Work the list.** Log each call from a business's page: what happened, what you pitched, the objection you heard, and when to follow up. The stage (not contacted, dialed, in conversation, meeting booked, and so on) moves on its own. The Outreach page lists follow-ups that are due, and a pitch brief on each business gives you an opener, the evidence, and answers to likely objections.
7. **Decide the gray zone.** Rules sort most businesses into target or noise. The ones they can't decide can be reviewed in a batch by an LLM through OpenRouter. You can always override a result by hand, and your choice wins.

Places are shared across niches, so a business scraped for one niche is not scraped or paid for twice. Relevance and score are kept per niche, while contact history and do-not-contact are kept per business.

## The offers

Each prospect is scored 0 to 100 for fit with each of the five things the agency sells:

- Facebook ads
- Speed to lead (AI receptionist and automated texts)
- Database reactivation
- Automated review system
- Website

The highest is the **lead offer** and the next is the **runner-up**. Every score lists its evidence, and anything inferred rather than observed is labelled "(inferred)".

The overall prospect score is a fit gate multiplied by three parts:

```
score = fit gate × (capacity + gaps + reachability)
```

- **Fit gate:** target ×1, undecided ×0.6, adjacent ×0.5, noise or closed ×0.
- **Capacity (max 40):** can they afford a retainer? Reviews, rating, a real website, listed hours.
- **Gaps (max 35):** what is visibly missing? No website, few photos, far fewer reviews than local peers, no hours or booking link.
- **Reachability (max 25):** can you contact them? A phone number and a website.

Peers are compared at ZIP code and category first, then area, then the whole niche, and a comparison needs at least five businesses. Tiers run from A (65 and above) down to D. Trade-level assumptions count for less than facts about the specific business, so the same offer doesn't lead for everyone. The weights live in `src/lib/scoring.ts`.

## Status

Built:

- Niches, playbooks and presets
- Areas as radius or polygon, grid, time and cost preview, confirm-then-launch, status polling, dedupe
- Business photos from the scraped data
- Relevance rules plus the LLM gray-zone review
- Offer-fit scoring, the prospects table, map and detail pages
- Enrichment: a free quick website scan (socials, emails, phones, site signals), web search for owner names with visible evidence, and a paid website reader as the second pass, for one business or in bulk, with a spend cap per run, background polling, and fallbacks between them
- The website scan fetches pages from addresses that come from Google listings, so it refuses private and local addresses (including through redirects), caps page size and time, and limits concurrency
- Outreach tracker: pipeline stages, a call log shared across niches, follow-up dates, an Outreach page with due follow-ups and an objection tally, and a pitch brief per business

Not built yet:

- **Coverage panel and AI keyword discovery:** cost per new on-target place, saturation, probe runs
- **Facebook ad checks:** the Ad Library lookup and the territory guard. The site scan already finds each business's Facebook page link, but whether it runs ads isn't checked yet, so the scoring's Facebook state is still empty.

## Setup

Requires Node and [pnpm](https://pnpm.io).

```bash
pnpm install
cp .env.example .env.local   # then add your keys
pnpm dev
```

The SQLite database is created at `data/leadfinder.db` and migrated on first request. It is not committed. After you edit `src/db/schema.ts`, run `pnpm db:generate` and commit the new file in `drizzle/`. The dev server holds the database connection open, so restart it after a schema change.

| Env var | Purpose |
| --- | --- |
| `APIFY_TOKEN` | Your Apify API token. Required to launch runs. |
| `APIFY_MAPS_ACTOR_ID` | Scraper actor. Defaults to `scraperlink/google-maps-scraper`. |
| `APIFY_PLAN` | `free`, `starter`, `scale` or `business`. Picks the per-result rate used for cost estimates. |
| `RUN_COST_CAP_USD` | Hard per-run cap sent to Apify as `maxTotalChargeUsd`. Default 5. |
| `APIFY_SEARCH_ACTOR_ID` | Google search actor used to find owners. Defaults to `scraperlink/google-search-results-serp-scraper`. |
| `APIFY_ENRICH_ACTOR_ID` | Website-reading actor (owner, emails, phones). Defaults to `menus-r-us/business-profile-enricher`. |
| `OPENROUTER_API_KEY` | Your OpenRouter key. Needed only for the gray-zone review. |
| `OPENROUTER_MODEL` | Model used for the review. |

To open the dev server from another device on your network, add that device's host to `allowedDevOrigins` in `next.config.ts`.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Dev server |
| `pnpm build` / `pnpm start` | Production build and server |
| `pnpm test` | Vitest suite |
| `pnpm lint` | ESLint |
| `pnpm db:generate` | Generate a migration after a schema change |

## Stack

Next.js (App Router) · Tailwind and shadcn · Framer Motion · SQLite through Drizzle · Leaflet with OpenStreetMap · Zod · Vitest.

## Notes

- `cid` is stored as text. The dataset JSON is pre-processed so 19-digit ids never pass through a JavaScript number.
- Grid points are an estimate of the actor's search centres. `src/lib/geo.test.ts` checks them against the 14 centres from a real run.
- Business photos are stored as Google image URLs, not downloaded. If they stop loading, the app falls back to an initials tile.
- Cache Components is turned off in `next.config.ts` on purpose: every page reads the local database per request.
- Tests run against throwaway SQLite files, never your real database.
