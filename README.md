<p align="center">
  <img src="docs/hero.webp" alt="Leadfinder: glowing pins on a night-time city map beside a ranked Top Prospects list with scores" width="100%">
</p>

# Leadfinder

**Find the home-service businesses worth calling, and know what to pitch each one.**

A local prospecting app for a marketing agency that sells to flooring and concrete, painting, fencing and moving companies. It scrapes Google Maps for a market, scores every business for fit with each of your offers, fills in the owner, socials and reviews, and then tracks your outreach.

It runs on your own machine with your own Apify and OpenRouter keys. There is no login and no hosted backend, so don't expose it to the internet.

## How it works

1. **Define a niche.** Start from a preset or from scratch. A niche holds a playbook: which Google Maps categories and keywords count as a target, which chains to exclude, and how to weight each offer.
2. **Draw areas.** Mark a service area on a map as a radius or a polygon. The app lays out the search grid and shows the number of search points, run time and cost before anything is spent.
3. **Launch a run.** After you confirm the estimate, a Google Maps scrape starts on Apify with a hard per-run spend cap. Results are fetched, normalized and deduplicated into one local database. A run can also collect each place's newest reviews, and start the paid searches below, if you tick them.
4. **Review prospects.** A sortable, filterable table (and a map) of everything found, each with a score, a lead offer and a runner-up. Open a business to see exactly why it scored the way it did, with the evidence.
5. **Enrich.** Fill in who owns each business and how to reach them, from free to paid (below).
6. **Work the list.** Log each call: what happened, what you pitched, the objection you heard, and when to follow up. The stage moves on its own. The Outreach page has a **Ready to call** card: Start calling opens your due follow-ups first, then the best untouched leads, and a bar on each business gives you Call, Skip (hides it for today) and, on the call form, Save and next. You can set a daily call goal there. The page also lists follow-ups that are due and tallies objections, and each business has a pitch brief with an opener, the evidence and answers to likely objections.
7. **Decide the gray zone.** Rules sort most businesses into target or noise. The ones they can't decide can be reviewed in a batch by an LLM. Your own decision always wins.

Places are shared across niches, so a business is never scraped or paid for twice. Relevance and score are kept per niche, while contact history and do-not-contact are kept per business.

| 1. Define a niche | 2. Draw an area |
| --- | --- |
| <img src="docs/leadfinder-newniche_md.webp" alt="New niche page with preset cards, a target definition, a playbook and a free preview of how many known places match" width="100%"> | <img src="docs/leadfinder-newarea_md.webp" alt="New area page with a polygon drawn over Austin on a map, grid spacing and run setup" width="100%"> |
| Start from a preset. The free preview shows how many places you already have would match before you spend anything. | Draw a polygon or radius. The grid of search points is laid out for you. |

| 3. See the cost first | 4. Confirm the launch |
| --- | --- |
| <img src="docs/leadfinder-areaestimate_sm.webp" alt="Estimate card showing grid points, run time, likely and maximum results and cost" width="100%"> | <img src="docs/leadfinder-newarea-run-launch-review_sm.webp" alt="Launch this run dialog with the likely cost, worst case and the hard cap sent to Apify" width="100%"> |
| Likely and worst-case numbers, before anything runs. | A last look at likely cost, worst case and the hard cap. |

<p align="center">
  <img src="docs/leadfinder-prospect-table_md.webp" alt="Prospects table sorted by score, with tier, lead offer and runner-up, area, stage, rating and contact for each business" width="100%"><br>
  <sub><b>5. Review prospects.</b> Sort and filter everything found. Each row shows its score, lead offer, runner-up and how to reach them.</sub>
</p>

| Same list, on a map | Gray zone, decided by an LLM |
| --- | --- |
| <img src="docs/leadfinder-prospect-map_md.webp" alt="Map of prospects coloured by tier, with the search areas outlined" width="100%"> | <img src="docs/leadfinder-prospect-ai-review_md.webp" alt="Dialog asking to classify undecided businesses with a model on OpenRouter, saying what is sent and that hand-set labels are never overwritten" width="100%"> |
| Pins are coloured by tier, with your search areas outlined. | Says what is sent and to which model before it runs. |

## Enrichment

"Enrich" on the table runs any of these over **everything your current filters match** (all pages, not just the visible rows, best scores first), after a cost confirmation. The dialog says exactly which filters it covers. With no filter chosen that is targets, adjacent and undecided, never noise. The buttons on a business's page do one business.

| Option | Cost | What it does |
| --- | --- | --- |
| **Quick scan** | Free | Reads the business's own website with plain HTTP, no AI. Finds social links (and links the Facebook page), emails, phone numbers, About and Contact pages, a founder named in structured data, and signals for the offer scores: no mobile site, no contact form or chat, a stale footer, a Facebook Pixel, a DIY site builder, or a site that doesn't load. It records why a site couldn't be read. **Runs on its own** after every Maps run. |
| **Search the web** | About $0.001 | Googles for the owner and has your model read the results. A name is accepted only when a result states it in its own text, and the quotes and sources are shown so you can judge it. Works without a website. |
| **Find Facebook page** | About $0.0005 | Googles the name, city and state plus "Facebook" and picks the page out of the results by matching name, place and phone, with no AI. Saves the page and, when the link carries one, its numeric page ID with a link to check its ads in the Meta Ad Library. A miss is recorded as "searched", never as "has no page". |
| **Fetch reviews** | About $0.002 for the 5 newest | Collects just the chosen places' newest Google reviews by place ID, with no search area, far cheaper than re-running an area. Updates only the review sample and the fresh rating and review count, then rescores every niche that tracks them. |
| **Paid website reader** | About $0.015 | The second pass for sites the quick scan can't read. Also gets emails, phones and services. Never automatic. |

<p align="center">
  <img src="docs/leadfinder-run-summary_sm.webp" alt="Run row showing 52 results, all new, and a note that 39 websites were scanned, 14 Facebook pages linked, with Raw data and Apify links" width="100%"><br>
  <sub>A finished run says what the free quick scan found, and links to the raw data.</sub>
</p>

Only the quick scan is automatic. The paid searches (owner names, Facebook pages) are **off unless you tick them** in an area's run setup under "After the run: paid searches". Ticked ones start once the run's places are in, for the first 100 that don't already have the answer, and their cost is in the estimate and the launch confirmation. You can also type an owner name yourself as you come across it (the pencil next to the owner on a business's page). A typed name is never replaced by any search or scan, and a stronger finding is never replaced by a weaker one.

Asking a run for the newest reviews ($0.25 per 1,000 reviews) dates each business's last review and shows whether the owner replies. A long gap points to the review-system offer, and a large review base that has gone quiet points to reactivation. A place already in your database gets its review data filled in when a run sees it again.

| Paid searches, off unless ticked | Newest reviews |
| --- | --- |
| <img src="docs/leadfinder-newarea-enrichment-options_sm.webp" alt="After the run: paid searches, with toggles for owner-name search and Facebook page search and their per-business cost" width="100%"> | <img src="docs/leadfinder-newarea-reviews-option_sm.webp" alt="Include the newest reviews toggle with a reviews-per-place setting and the cost per 1,000 reviews" width="100%"> |
| Both are in an area's run setup, each with its cost. | How many to fetch per place. 5 is enough to date the last review. |

<p align="center">
  <img src="docs/leadfinder-prospect-detail-extradetails_md.webp" alt="Details tab of a business with owner and contact, website signals, emails, phones, social links, the Facebook page, relevance override and do-not-contact" width="100%"><br>
  <sub>What enrichment fills in on a business's Details tab: owner, emails, phones, socials and the Facebook page. You can override relevance or mark do-not-contact here.</sub>
</p>

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

Peers are compared at ZIP code and category first, then area, then the whole niche, and a comparison needs at least five businesses. Tiers run from A (65 and above) down to D. Trade-level assumptions count for less than facts about the specific business, so the same offer doesn't lead for everyone. Some evidence depends on today's date (how long since the last review), so scores refresh weekly. The weights live in `src/lib/scoring.ts`.

<p align="center">
  <img src="docs/leadfinder-prospect-detail-score_md.webp" alt="Score and offers tab with capacity, gaps and reachability bars, and a card of evidence for each of the five offers" width="100%"><br>
  <sub>The Score &amp; offers tab. Inferred evidence is shown in orange.</sub>
</p>

## Outreach

Each business opens on its Outreach tab: a call log with one tap per outcome, and a pitch brief with who to ask for, an opener, a follow-up question, what we noticed (with the evidence) and answers to likely objections. **Copy brief** puts it on the clipboard.

<p align="center">
  <img src="docs/leadfinder-prospect-detail-outreach2_md.webp" alt="A business page on the Outreach tab, with the call log outcomes beside a pitch brief with opener, evidence and objection answers" width="100%">
</p>

<p align="center">
  <img src="docs/leadfinder-outreach_md.webp" alt="Outreach page with the Ready to call card, a daily goal progress bar, upcoming follow-ups, recent calls and objections" width="100%"><br>
  <sub>The Outreach page: Ready to call, today's goal, follow-ups, recent calls and the objections you hear most.</sub>
</p>

| Working the queue | On a phone |
| --- | --- |
| <img src="docs/leadfinder-call-queue_md.webp" alt="A business page with a bar at the bottom showing a fresh lead, how many are waiting after it, and Skip and Call buttons" width="100%"> | <img src="docs/leadfinder-mobile-call-queue_md.webp" alt="The same business page on a phone, with the queue bar above a bottom tab bar for Niches, Outreach and More" width="60%"> |
| A bar on each business: Skip hides it for today, Call dials it. | The queue bar sits above the tab bar. Niches, Outreach and More (Data, new niche, theme) are always one tap away. |

## Your data

The **Data** page (in the sidebar, or under More on a phone) has three things:

- **Backup:** downloads the whole database as one file. Do it now and then, since your call history lives only in `data/leadfinder.db`. To restore, stop the app and put the file back in its place.
- **Spreadsheets:** CSVs of every prospect (with score, owner, stage and Facebook page) and every logged call.
- **Apify runs:** every run the app has started, with **Raw data** (exactly what Apify returned, as JSON) and a link to the run in your Apify console. Apify deletes old run data after a while, so download what you want to keep.

<p align="center">
  <img src="docs/leadfinder-data-backup-export_md.webp" alt="Data page with a Download backup button, CSV exports for prospects and the call log, and a table of Apify runs with raw data links" width="100%">
</p>

## Roadmap

**Built:** niches and presets, areas and cost-previewed runs, relevance rules plus an LLM gray-zone review, offer-fit scoring with visible evidence, the prospects table, map and detail pages, all of the enrichment above, review recency, the outreach tracker with a call queue, backup and exports, and a phone layout with a bottom tab bar.

**Not built yet:**

- **Meta Ad Library check.** Whether a Facebook page runs ads. The page and its ID are already saved, but the scoring's Facebook state is still empty.
- **Coverage panel and AI keyword discovery:** cost per new on-target place, saturation, probe runs.
- **Territory guard** for signed clients.
- **Clearing a wrong Facebook match** by hand (you can already type or fix an owner name).

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
| `APIFY_PLAN` | `free`, `starter`, `scale` or `business`. Picks the per-result rate used for cost estimates. |
| `RUN_COST_CAP_USD` | Hard per-run cap sent to Apify as `maxTotalChargeUsd`. Default 5. |
| `APIFY_MAPS_ACTOR_ID` | Maps scraper. Defaults to `scraperlink/google-maps-scraper`. |
| `APIFY_SEARCH_ACTOR_ID` | Google search actor (owner and Facebook searches). Defaults to `scraperlink/google-search-results-serp-scraper`. |
| `APIFY_ENRICH_ACTOR_ID` | Website-reading actor. Defaults to `menus-r-us/business-profile-enricher`. |
| `AUTO_SCAN_ON_INGEST` | Set to `0` to stop the free quick scan from running after each Maps run. |
| `OPENROUTER_API_KEY` | Your OpenRouter key. Used by the gray-zone review and the owner search. |
| `OPENROUTER_MODEL` | Model used for both. The model's hidden "thinking" is switched off for these short jobs, because a reasoning model can spend the whole token limit on it and return no answer. |

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

Next.js (App Router) · Tailwind and shadcn · Framer Motion · SQLite through Drizzle · Leaflet with OpenStreetMap · Cheerio · Zod · Vitest.

## Notes

- **The website scan fetches addresses that come from Google listings**, so it refuses private and local addresses (including through redirects), caps page size and time, and limits concurrency.
- `cid` is stored as text. The dataset JSON is pre-processed so 19-digit ids never pass through a JavaScript number.
- Grid points are an estimate of the actor's search centres. `src/lib/geo.test.ts` checks them against the 14 centres from a real run.
- Business photos are stored as Google image URLs, not downloaded. If they stop loading, the app falls back to an initials tile.
- Press **D** to switch between light and dark mode. On a phone, use More in the bottom tab bar.
- Cache Components is turned off in `next.config.ts` on purpose: every page reads the local database per request.
- Tests run against throwaway SQLite files and stubbed network calls, never your real database or real Apify. (`APIFY_API_BASE`, `OPENROUTER_API_BASE` and `SITE_SCAN_ALLOW_PRIVATE` exist only so tests can point at local stand-ins. Don't set them for real use.)
