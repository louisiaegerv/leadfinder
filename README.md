# Leadfinder

A local prospecting app for a marketing agency that sells to home-service businesses (flooring and concrete, painting, fencing, movers). It finds the businesses in a market, works out which ones are worth calling, and tells you what to pitch each one.

It runs on your own machine, with your own Apify and OpenRouter keys. There is no login and no hosted backend, so don't expose it to the internet.

## What it does

1. **Define a niche.** Start from a preset or from scratch. A niche holds a playbook: which Google Maps categories and keywords count as a target, which chains to exclude, and how to weight each offer.
2. **Draw areas.** Mark a service area on a map as a radius or a polygon. The app lays out the search grid and shows the number of search points, the estimated run time and the estimated cost before anything is spent.
3. **Launch a run.** After you confirm the estimate, a Google Maps scrape starts on Apify with a hard per-run cost cap. Results are fetched, normalized and deduplicated into one local database.
4. **Review prospects.** A sortable, filterable table (and a map) of everything found, each with a score, a lead offer and a runner-up. Open a business to see exactly why it scored the way it did.
5. **Decide the gray zone.** Rules sort most businesses into target or noise. The ones they can't decide can be reviewed in a batch by an LLM through OpenRouter. You can always override a result by hand, and your choice wins.

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

Not built yet:

- **Coverage panel and AI keyword discovery:** cost per new on-target place, saturation, probe runs
- **Outreach tracker:** stages, call log, follow-ups, pitch brief
- **Enrichment and Facebook checks:** owner details, Facebook page match, Ad Library, territory guard. The scoring already accepts a Facebook state, but nothing fills it in yet.

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
