import { desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { contacts, enrichmentRuns, nichePlaces, places } from "@/db/schema";
import { MAPS_ACTOR, PLAN, RUN_COST_CAP_USD, buildPlaceIdsInput, startRun } from "./apify";
import { placesInFlight } from "./enrich-db";
import { estimateReviewFetchUsd } from "./geo";
import { loadPlaces, syncSearchRun, type SearchIngest, type SearchStats } from "./owner-search-db";
import { nicheFilterWhere, type PlaceFilters } from "./queries";
import { DEFAULT_MAX_REVIEWS, readReviews } from "./reviews";
import { rescoreNiche } from "./rescore";

/** Most places one click will fetch reviews for. Cheap per place, so this is generous. */
export const MAX_REVIEW_FETCH_PER_CLICK = 300;
/** Places per Apify run. */
const CHUNK = 100;

// ---------- choosing which places ----------

/** Best-scoring businesses the table is showing whose reviews have never been collected. */
export function findReviewCandidates(nicheId: number, f: PlaceFilters, limit: number) {
  const inFlight = placesInFlight();
  const rows = db
    .select({ placeId: places.placeId, dnc: contacts.doNotContact, sample: places.reviewSample })
    .from(nichePlaces)
    .innerJoin(places, eq(places.placeId, nichePlaces.placeId))
    .leftJoin(contacts, eq(contacts.placeId, nichePlaces.placeId))
    .where(nicheFilterWhere(nicheId, f))
    .orderBy(sql`${nichePlaces.score} is null`, desc(nichePlaces.score))
    .all();

  const stats: SearchStats = { matching: rows.length, eligible: 0, alreadyDone: 0, doNotContact: 0, inProgress: 0, withWebsite: 0 };
  const ids: string[] = [];
  for (const r of rows) {
    if (r.dnc) stats.doNotContact++;
    else if (r.sample) stats.alreadyDone++;
    else if (inFlight.has(r.placeId)) stats.inProgress++;
    else ids.push(r.placeId);
  }
  stats.eligible = ids.length;
  return { stats, placeIds: ids.slice(0, limit) };
}

/** Businesses picked by hand. Refreshing one that already has reviews is allowed: they go stale. */
export function resolveReviewTargets(placeIds: string[]): { placeIds: string[]; skipped: { placeId: string; reason: string }[] } {
  const inFlight = placesInFlight();
  const rows = db
    .select({ placeId: places.placeId, dnc: contacts.doNotContact })
    .from(places)
    .leftJoin(contacts, eq(contacts.placeId, places.placeId))
    .where(inArray(places.placeId, placeIds))
    .all();
  const ok: string[] = [];
  const skipped: { placeId: string; reason: string }[] = [];
  for (const r of rows) {
    if (r.dnc) skipped.push({ placeId: r.placeId, reason: "marked do-not-contact" });
    else if (inFlight.has(r.placeId)) skipped.push({ placeId: r.placeId, reason: "already being looked up" });
    else ok.push(r.placeId);
  }
  return { placeIds: ok, skipped };
}

// ---------- starting ----------

/**
 * Ask the Maps scraper for just these places' newest reviews, by place id. One run per batch (and per country,
 * since `gl` is the country), each with its own spend cap.
 */
export async function startReviewFetch(placeIds: string[], maxReviews = DEFAULT_MAX_REVIEWS) {
  const rows = loadPlaces(placeIds).slice(0, MAX_REVIEW_FETCH_PER_CLICK);
  if (rows.length === 0) throw new Error("Nothing to fetch");
  const plan = PLAN();
  const cap = RUN_COST_CAP_USD();

  const byCountry = new Map<string, string[]>();
  for (const r of rows) {
    const c = (r.countryCode ?? "US").toLowerCase();
    byCountry.set(c, [...(byCountry.get(c) ?? []), r.placeId]);
  }

  const runIds: number[] = [];
  let started = 0;
  let lastError: Error | null = null;
  for (const [gl, ids] of byCountry) {
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      try {
        const run = await startRun(
          buildPlaceIdsInput({ placeIds: chunk, maxReviews, gl, hl: "en" }),
          Math.min(cap, estimateReviewFetchUsd(chunk.length, maxReviews, plan) + 0.01),
          MAPS_ACTOR(),
          Math.max(300, chunk.length * 6),
        );
        const row = db
          .insert(enrichmentRuns)
          .values({
            kind: "reviews",
            apifyRunId: run.id,
            datasetId: run.defaultDatasetId,
            targets: chunk.map((placeId) => ({ placeId, url: "" })),
            meta: { queries: {}, fallback: false },
          })
          .returning()
          .get();
        runIds.push(row.id);
        started += chunk.length;
      } catch (e) {
        lastError = e as Error; // earlier batches keep running; report what did start
      }
    }
  }
  if (runIds.length === 0) throw lastError ?? new Error("Could not start the review fetch");
  return { runIds, count: started, estimatedUsd: estimateReviewFetchUsd(started, maxReviews, plan), trimmed: placeIds.length > rows.length };
}

// ---------- applying the results ----------

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * Save each place's reviews from a finished run. Only the review sample (and the fresh rating and review count
 * that come with it) is touched; everything else about the place is left alone. A place the actor returned
 * without a `reviews` field is left as it was. Every niche that tracks an updated place is rescored.
 */
export const ingestReviewsRun: SearchIngest = async (run, rows) => {
  const wanted = new Set(run.targets.map((t) => t.placeId));
  const byId = new Map<string, Record<string, unknown>>();
  for (const r of rows) if (typeof r.placeId === "string" && wanted.has(r.placeId)) byId.set(r.placeId, r);

  const updated: string[] = [];
  const notFound: string[] = [];
  const now = new Date();
  db.transaction((tx) => {
    for (const t of run.targets) {
      const item = byId.get(t.placeId);
      const sample = item ? readReviews(item.reviews) : null;
      if (!item || sample === null) {
        notFound.push(t.placeId);
        continue;
      }
      const set: Partial<typeof places.$inferInsert> = { reviewSample: sample, reviewsSampledAt: now };
      const count = num(item.reviewsCount);
      const score = num(item.totalScore ?? item.rating);
      if (count !== null) set.reviewsCount = count;
      if (score !== null) set.totalScore = score;
      tx.update(places).set(set).where(eq(places.placeId, t.placeId)).run();
      updated.push(t.placeId);
    }
  });

  const niches = new Set<number>();
  for (let i = 0; i < updated.length; i += 500) {
    const rowsN = db.selectDistinct({ id: nichePlaces.nicheId }).from(nichePlaces).where(inArray(nichePlaces.placeId, updated.slice(i, i + 500))).all();
    for (const r of rowsN) niches.add(r.id);
  }
  for (const id of niches) rescoreNiche(id);

  return { searched: run.targets.length, found: updated.length, llmCostUsd: 0, notFound };
};

export const syncReviews = (id: number) => syncSearchRun(id, ingestReviewsRun);

