import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { contacts, enrichment, enrichmentRuns, nichePlaces, places } from "@/db/schema";
import { ENRICH_ACTOR, RUN_COST_CAP_USD, TERMINAL, fetchDataset, getRun, startRun } from "./apify";
import {
  MAX_PER_RUN,
  enrichCapUsd,
  enrichableUrl,
  estimateEnrichCostUsd,
  matchTargets,
  maxBusinessesForCap,
  parseItem,
  pickOwner,
  type Profile,
} from "./enrich";
import { nicheFilterWhere, type PlaceFilters } from "./queries";

export type Target = { placeId: string; url: string };

const KIND = "profile";

// ---------- what is already running ----------

export function getActiveRuns() {
  return db.select().from(enrichmentRuns).where(inArray(enrichmentRuns.status, ["running", "ingesting"])).all();
}

/** Places that are part of a run still in flight, so they are never sent twice. */
export function placesInFlight(): Set<string> {
  return new Set(getActiveRuns().flatMap((r) => r.targets.map((t) => t.placeId)));
}

// ---------- choosing who to enrich ----------

export type CandidateStats = {
  matching: number;
  eligible: number;
  alreadyEnriched: number;
  noWebsite: number;
  doNotContact: number;
  inProgress: number;
};

/**
 * Who to enrich from the rows a table filter shows: best score first, skipping businesses
 * with no readable website, already enriched, do-not-contact, or already in a run.
 */
export function findCandidates(nicheId: number, f: PlaceFilters, limit: number) {
  const inFlight = placesInFlight();
  const rows = db
    .select({
      placeId: places.placeId,
      website: places.website,
      domain: places.domain,
      dnc: contacts.doNotContact,
      enrichedAt: enrichment.fetchedAt,
    })
    .from(nichePlaces)
    .innerJoin(places, eq(places.placeId, nichePlaces.placeId))
    .leftJoin(contacts, eq(contacts.placeId, nichePlaces.placeId))
    .leftJoin(enrichment, and(eq(enrichment.placeId, nichePlaces.placeId), eq(enrichment.kind, KIND)))
    .where(nicheFilterWhere(nicheId, f))
    .orderBy(sql`${nichePlaces.score} is null`, desc(nichePlaces.score))
    .all();

  const stats: CandidateStats = { matching: rows.length, eligible: 0, alreadyEnriched: 0, noWebsite: 0, doNotContact: 0, inProgress: 0 };
  const eligible: Target[] = [];
  for (const r of rows) {
    const url = enrichableUrl(r);
    if (r.dnc) stats.doNotContact++;
    else if (!url) stats.noWebsite++;
    else if (r.enrichedAt) stats.alreadyEnriched++;
    else if (inFlight.has(r.placeId)) stats.inProgress++;
    else eligible.push({ placeId: r.placeId, url });
  }
  stats.eligible = eligible.length;
  return { stats, targets: eligible.slice(0, limit) };
}

/** Specific businesses picked by hand. Re-enriching one that already has data is allowed. */
export function resolveTargets(placeIds: string[]): { targets: Target[]; skipped: { placeId: string; reason: string }[] } {
  const inFlight = placesInFlight();
  const rows = db
    .select({ placeId: places.placeId, website: places.website, domain: places.domain, dnc: contacts.doNotContact })
    .from(places)
    .leftJoin(contacts, eq(contacts.placeId, places.placeId))
    .where(inArray(places.placeId, placeIds))
    .all();
  const targets: Target[] = [];
  const skipped: { placeId: string; reason: string }[] = [];
  for (const r of rows) {
    const url = enrichableUrl(r);
    if (r.dnc) skipped.push({ placeId: r.placeId, reason: "marked do-not-contact" });
    else if (!url) skipped.push({ placeId: r.placeId, reason: "no business website to read" });
    else if (inFlight.has(r.placeId)) skipped.push({ placeId: r.placeId, reason: "already being enriched" });
    else targets.push({ placeId: r.placeId, url });
  }
  return { targets, skipped };
}

// ---------- running ----------

/** Start an Apify run over the given websites and remember which place each belongs to. */
export async function startEnrichment(targets: Target[]) {
  const cap = RUN_COST_CAP_USD();
  const fit = Math.min(MAX_PER_RUN, maxBusinessesForCap(cap));
  const use = targets.slice(0, fit);
  if (use.length === 0) throw new Error("Nothing to enrich");
  const urls = [...new Set(use.map((t) => t.url))];

  const run = await startRun({ mode: "urls", urls }, enrichCapUsd(urls.length, cap), ENRICH_ACTOR());
  const row = db
    .insert(enrichmentRuns)
    .values({ apifyRunId: run.id, datasetId: run.defaultDatasetId, targets: use })
    .returning()
    .get();
  return { runId: row.id, count: use.length, estimatedUsd: estimateEnrichCostUsd(urls.length), trimmed: targets.length > use.length };
}

type Writer = Pick<typeof db, "select" | "insert">;

/**
 * Set the owner on a business's contact. A name you typed is never replaced, and a weaker
 * finding (say a guess from the website) never replaces a stronger one (two sites agreeing).
 */
export function saveOwner(tx: Writer, placeId: string, name: string, confidence: number, source: "enrichment" | "search" | "site"): boolean {
  const existing = tx.select().from(contacts).where(eq(contacts.placeId, placeId)).get();
  if (existing?.ownerName) {
    if (existing.source === "manual") return false;
    if ((existing.confidence ?? 0) > confidence) return false;
  }
  const now = new Date();
  tx.insert(contacts)
    .values({ placeId, ownerName: name, source, confidence, updatedAt: now })
    .onConflictDoUpdate({ target: contacts.placeId, set: { ownerName: name, source, confidence, updatedAt: now } })
    .run();
  return true;
}

/** Save each result against its place, and set the owner on the contact when one is clear. */
export function applyResults(targets: Target[], items: Record<string, unknown>[], source: string) {
  let enriched = 0;
  let owners = 0;
  db.transaction((tx) => {
    for (const item of items) {
      if (item.success === false) continue; // the actor reports failures in-band; they aren't charged and stay candidates
      const profile = parseItem(item);
      const owner = pickOwner(profile.people);
      for (const t of matchTargets(item, targets)) {
        const now = new Date();
        tx.insert(enrichment)
          .values({ placeId: t.placeId, kind: KIND, data: profile, source, confidence: profile.confidence, fetchedAt: now })
          .onConflictDoUpdate({
            target: [enrichment.placeId, enrichment.kind],
            set: { data: profile, source, confidence: profile.confidence, fetchedAt: now },
          })
          .run();
        enriched++;

        if (owner && saveOwner(tx, t.placeId, owner.name, owner.certain ? 0.9 : 0.5, "enrichment")) owners++;
      }
    }
  });
  return { enriched, owners };
}

export const REMOTE_STATUS: Record<string, "running" | "ingested" | "failed" | "aborted"> = {
  READY: "running",
  RUNNING: "running",
  "TIMING-OUT": "running",
  ABORTING: "running",
  SUCCEEDED: "ingested",
  FAILED: "failed",
  "TIMED-OUT": "failed",
  ABORTED: "aborted",
};

/** Poll Apify; once the run has succeeded, fetch and apply the results. Safe to call repeatedly. */
export async function syncEnrichment(id: number) {
  const run = db.select().from(enrichmentRuns).where(eq(enrichmentRuns.id, id)).get();
  if (!run) return null;
  if (run.status !== "running" || !run.apifyRunId) return run;

  const remote = await getRun(run.apifyRunId);
  const status = REMOTE_STATUS[remote.status] ?? "running";
  if (status === "running") return run;

  let result = { enriched: 0, owners: 0 };
  if (status === "ingested") {
    const datasetId = remote.defaultDatasetId ?? run.datasetId;
    const items = datasetId ? await fetchDataset(datasetId) : [];
    result = applyResults(run.targets, items, ENRICH_ACTOR());
  }
  db.update(enrichmentRuns)
    .set({
      status,
      costUsd: remote.usageTotalUsd ?? run.costUsd,
      enrichedCount: result.enriched,
      ownerCount: result.owners,
      error: status === "failed" ? (remote.statusMessage ?? `Apify status ${remote.status}`) : null,
      finishedAt: TERMINAL.has(remote.status) ? new Date(remote.finishedAt ?? Date.now()) : new Date(),
    })
    .where(eq(enrichmentRuns.id, id))
    .run();
  return db.select().from(enrichmentRuns).where(eq(enrichmentRuns.id, id)).get()!;
}

// ---------- reading ----------

export function getEnrichment(placeId: string): { profile: Profile; fetchedAt: Date; source: string } | null {
  const row = db
    .select()
    .from(enrichment)
    .where(and(eq(enrichment.placeId, placeId), eq(enrichment.kind, KIND)))
    .get();
  return row ? { profile: row.data as unknown as Profile, fetchedAt: row.fetchedAt, source: row.source } : null;
}
