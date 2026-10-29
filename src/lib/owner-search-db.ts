import { createHash } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { contacts, enrichment, enrichmentRuns, llmCache, nichePlaces, places } from "@/db/schema";
import { RUN_COST_CAP_USD, SEARCH_ACTOR, fetchDataset, getRun, startRun } from "./apify";
import { REMOTE_STATUS, getEnrichment, placesInFlight, resolveTargets, saveOwner, startEnrichment } from "./enrich-db";
import { chatJson, MODEL } from "./llm";
import {
  EXTRACTION_JSON_SCHEMA,
  MAX_SEARCH_PER_CLICK,
  OWNER_SYSTEM,
  SEARCH_CHUNK,
  buildOwnerMessage,
  buildQueries,
  SEARCH_PAGE_USD,
  estimateSearchCostUsd,
  extractionSchema,
  searchCapUsd,
  snippetsFrom,
  verifyOwner,
  type OwnerFinding,
  type SearchPlace,
  type Snippet,
} from "./owner-search";
import { enrichableUrl } from "./enrich";
import { nicheFilterWhere, type PlaceFilters } from "./queries";

const KIND = "owner_search";

export type PlaceRow = SearchPlace & { placeId: string; countryCode: string | null };
export type RunRow = typeof enrichmentRuns.$inferSelect;

export type OwnerSearchRecord = {
  finding: OwnerFinding | null;
  snippetCount: number;
  queries: string[];
};

export function loadPlaces(placeIds: string[]): PlaceRow[] {
  if (placeIds.length === 0) return [];
  return db
    .select({
      placeId: places.placeId,
      title: places.title,
      city: places.city,
      state: places.state,
      domain: places.domain,
      website: places.website,
      phone: places.phone,
      countryCode: places.countryCode,
    })
    .from(places)
    .where(inArray(places.placeId, placeIds))
    .all();
}

// ---------- choosing who to search for ----------

export type SearchStats = {
  matching: number;
  eligible: number;
  alreadyDone: number;
  doNotContact: number;
  inProgress: number;
  /** Of the eligible ones, how many have a website the fallback could read. */
  withWebsite: number;
};

/** A name already confirmed (typed, or two sources agreeing) is not worth searching for again. */
const hasGoodOwner = (name: string | null, confidence: number | null, source: string | null) =>
  !!name && (source === "manual" || (confidence ?? 0) >= 0.8);

/** Best-scoring businesses the table is showing that still need an owner. */
export function findSearchCandidates(nicheId: number, f: PlaceFilters, limit: number) {
  const inFlight = placesInFlight();
  const rows = db
    .select({
      placeId: places.placeId,
      website: places.website,
      domain: places.domain,
      dnc: contacts.doNotContact,
      ownerName: contacts.ownerName,
      ownerConfidence: contacts.confidence,
      ownerSource: contacts.source,
      searchedAt: enrichment.fetchedAt,
    })
    .from(nichePlaces)
    .innerJoin(places, eq(places.placeId, nichePlaces.placeId))
    .leftJoin(contacts, eq(contacts.placeId, nichePlaces.placeId))
    .leftJoin(enrichment, and(eq(enrichment.placeId, nichePlaces.placeId), eq(enrichment.kind, KIND)))
    .where(nicheFilterWhere(nicheId, f))
    .orderBy(sql`${nichePlaces.score} is null`, desc(nichePlaces.score))
    .all();

  const stats: SearchStats = { matching: rows.length, eligible: 0, alreadyDone: 0, doNotContact: 0, inProgress: 0, withWebsite: 0 };
  const eligible: string[] = [];
  for (const r of rows) {
    if (r.dnc) stats.doNotContact++;
    else if (r.searchedAt || hasGoodOwner(r.ownerName, r.ownerConfidence, r.ownerSource)) stats.alreadyDone++;
    else if (inFlight.has(r.placeId)) stats.inProgress++;
    else {
      eligible.push(r.placeId);
      if (enrichableUrl(r)) stats.withWebsite++;
    }
  }
  stats.eligible = eligible.length;
  return { stats, placeIds: eligible.slice(0, limit) };
}

/** Businesses picked by hand. Searching again for one already searched is allowed. */
export function resolveSearchTargets(placeIds: string[]): { placeIds: string[]; skipped: { placeId: string; reason: string }[] } {
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

export type SearchKind = "search" | "facebook";

/**
 * One Apify search run per batch of businesses (and per country), each with its own spend cap.
 * `kind` says what the results are for: an owner name, or a Facebook page.
 */
export async function startSearchRuns(placeIds: string[], kind: SearchKind, queriesFor: (p: PlaceRow) => string[], opts: { fallback: boolean }) {
  const rows = loadPlaces(placeIds).slice(0, MAX_SEARCH_PER_CLICK);
  if (rows.length === 0) throw new Error("Nothing to search");
  const cap = RUN_COST_CAP_USD();

  const byCountry = new Map<string, PlaceRow[]>();
  for (const r of rows) {
    const c = (r.countryCode ?? "US").toUpperCase();
    byCountry.set(c, [...(byCountry.get(c) ?? []), r]);
  }

  const runIds: number[] = [];
  let started = 0;
  let queryTotal = 0;
  let lastError: Error | null = null;
  for (const [country, list] of byCountry) {
    for (let i = 0; i < list.length; i += SEARCH_CHUNK) {
      const chunk = list.slice(i, i + SEARCH_CHUNK);
      const queries: Record<string, string[]> = {};
      for (const p of chunk) queries[p.placeId] = queriesFor(p);
      const all = [...new Set(Object.values(queries).flat())];
      try {
        const run = await startRun(
          { keyword: all.join("\n"), limit: "10", include_merged: false, country, hl: "en" },
          searchCapUsd(all.length, cap),
          SEARCH_ACTOR(),
          Math.max(300, all.length * 10),
        );
        const row = db
          .insert(enrichmentRuns)
          .values({
            kind,
            apifyRunId: run.id,
            datasetId: run.defaultDatasetId,
            targets: chunk.map((p) => ({ placeId: p.placeId, url: p.website ?? "" })),
            meta: { queries, fallback: opts.fallback },
          })
          .returning()
          .get();
        runIds.push(row.id);
        started += chunk.length;
        queryTotal += all.length;
      } catch (e) {
        lastError = e as Error; // earlier batches keep running; report what did start
      }
    }
  }
  if (runIds.length === 0) throw lastError ?? new Error("Could not start the search");
  // Owner searches also pay for the model reading the results; Facebook matching is plain code.
  const estimatedUsd = kind === "search" ? estimateSearchCostUsd(queryTotal, started) : queryTotal * SEARCH_PAGE_USD;
  return { runIds, count: started, estimatedUsd, trimmed: placeIds.length > rows.length };
}

export const startOwnerSearch = (placeIds: string[], opts: { fallback: boolean }) => startSearchRuns(placeIds, "search", buildQueries, opts);

// ---------- reading the results ----------

const cacheKey = (p: SearchPlace, snippets: Snippet[]) =>
  createHash("sha256")
    .update(JSON.stringify(["owner-search-v1", MODEL(), p.title, p.city, p.state, p.domain, snippets.map((s) => [s.url, s.title, s.description])]))
    .digest("hex");

async function extract(p: SearchPlace, snippets: Snippet[]) {
  const key = cacheKey(p, snippets);
  const hit = db.select().from(llmCache).where(eq(llmCache.key, key)).get();
  const cached = hit ? extractionSchema.safeParse(hit.response) : null;
  if (cached?.success) return { x: cached.data, cost: 0 };

  const res = await chatJson({
    system: OWNER_SYSTEM,
    user: buildOwnerMessage(p, snippets),
    schemaName: "owner_from_search",
    jsonSchema: EXTRACTION_JSON_SCHEMA,
    parse: extractionSchema,
    maxTokens: 800,
  });
  db.insert(llmCache).values({ key, task: "owner-search", response: res.data, model: res.model, costUsd: res.costUsd }).onConflictDoNothing().run();
  return { x: res.data, cost: res.costUsd ?? 0 };
}

/**
 * Turn a finished search run into owners. The model only proposes; verifyOwner decides, and
 * nothing is saved for a business whose model call failed, so it can simply be tried again.
 */
export async function ingestSearchRun(run: RunRow, rows: Record<string, unknown>[]) {
  const meta = run.meta;
  if (!meta) throw new Error("Search run has no query details");
  const byId = new Map(loadPlaces(run.targets.map((t) => t.placeId)).map((p) => [p.placeId, p]));
  const jobs = run.targets.flatMap((t) => {
    const place = byId.get(t.placeId);
    return place ? [{ place, snippets: snippetsFrom(rows, meta.queries[t.placeId] ?? []) }] : [];
  });

  type Done = { place: PlaceRow; snippets: Snippet[]; finding: OwnerFinding | null; ok: boolean };
  const done: Done[] = [];
  let llmCost = 0;
  let firstError: string | null = null;
  for (let i = 0; i < jobs.length; i += 4) {
    await Promise.all(
      jobs.slice(i, i + 4).map(async (job) => {
        if (job.snippets.length === 0) return void done.push({ ...job, finding: null, ok: true });
        try {
          const { x, cost } = await extract(job.place, job.snippets);
          llmCost += cost;
          done.push({ ...job, finding: verifyOwner(x, job.snippets, job.place), ok: true });
        } catch (e) {
          firstError ??= e instanceof Error ? e.message : String(e);
          done.push({ ...job, finding: null, ok: false });
        }
      }),
    );
  }
  // A key or quota problem hits every call; say so instead of recording a pile of empty results.
  if (done.length > 0 && done.every((d) => !d.ok)) throw new Error(`Reading the search results failed: ${firstError}`);

  let owners = 0;
  db.transaction((tx) => {
    for (const d of done) {
      if (!d.ok) continue;
      const record: OwnerSearchRecord = { finding: d.finding, snippetCount: d.snippets.length, queries: meta.queries[d.place.placeId] ?? [] };
      const now = new Date();
      tx.insert(enrichment)
        .values({ placeId: d.place.placeId, kind: KIND, data: record, source: SEARCH_ACTOR(), confidence: d.finding?.confidence ?? null, fetchedAt: now })
        .onConflictDoUpdate({
          target: [enrichment.placeId, enrichment.kind],
          set: { data: record, source: SEARCH_ACTOR(), confidence: d.finding?.confidence ?? null, fetchedAt: now },
        })
        .run();
      if (d.finding && saveOwner(tx, d.place.placeId, d.finding.name, d.finding.confidence, "search")) owners++;
    }
  });

  return {
    searched: done.filter((d) => d.ok).length,
    owners,
    llmCostUsd: llmCost,
    /** Searched but no owner found and none known: candidates for reading the website. */
    notFound: done.filter((d) => d.ok && !d.finding).map((d) => d.place.placeId),
  };
}

/** Websites to read for businesses the search could not name, skipping any that already have a name or data. */
function fallbackTargets(placeIds: string[]) {
  if (placeIds.length === 0) return [];
  const named = new Set(
    db
      .select({ placeId: contacts.placeId, name: contacts.ownerName })
      .from(contacts)
      .where(inArray(contacts.placeId, placeIds))
      .all()
      .filter((c) => c.name)
      .map((c) => c.placeId),
  );
  return resolveTargets(placeIds.filter((id) => !named.has(id))).targets.filter((t) => !getEnrichment(t.placeId));
}

/** Poll a search run; once it succeeds, read the results with the model and save the owners. Safe to call repeatedly. */
/** What a finished search run produced, whichever kind it was. `found` is owner names, or Facebook pages. */
export type IngestSummary = { searched: number; found: number; llmCostUsd: number; notFound: string[] };
export type SearchIngest = (run: RunRow, rows: Record<string, unknown>[]) => Promise<IngestSummary>;

const ingestOwners: SearchIngest = async (run, rows) => {
  const r = await ingestSearchRun(run, rows);
  return { searched: r.searched, found: r.owners, llmCostUsd: r.llmCostUsd, notFound: r.notFound };
};

export const syncSearch = (id: number) => syncSearchRun(id, ingestOwners);

export async function syncSearchRun(id: number, ingest: SearchIngest): Promise<{ run: RunRow; fallbackStarted: number } | null> {
  const get = () => db.select().from(enrichmentRuns).where(eq(enrichmentRuns.id, id)).get();
  const run = get();
  if (!run) return null;
  if (run.status !== "running" || !run.apifyRunId) return { run, fallbackStarted: 0 };

  const remote = await getRun(run.apifyRunId);
  const status = REMOTE_STATUS[remote.status] ?? "running";
  if (status === "running") return { run, fallbackStarted: 0 };

  const finish = (patch: Partial<RunRow>) => {
    db.update(enrichmentRuns).set({ finishedAt: new Date(), costUsd: remote.usageTotalUsd ?? run.costUsd, ...patch }).where(eq(enrichmentRuns.id, id)).run();
    return get()!;
  };
  if (status !== "ingested") {
    return { run: finish({ status, error: status === "failed" ? (remote.statusMessage ?? `Apify status ${remote.status}`) : null }), fallbackStarted: 0 };
  }

  // Claim the run so a second poller doesn't pay for the same model calls.
  const claimed = db
    .update(enrichmentRuns)
    .set({ status: "ingesting" })
    .where(and(eq(enrichmentRuns.id, id), eq(enrichmentRuns.status, "running")))
    .run().changes;
  if (!claimed) return { run: get()!, fallbackStarted: 0 };

  let items: Record<string, unknown>[];
  try {
    items = await fetchDataset(remote.defaultDatasetId ?? run.datasetId ?? "");
  } catch (e) {
    db.update(enrichmentRuns).set({ status: "running" }).where(eq(enrichmentRuns.id, id)).run(); // transient: try again next poll
    throw e;
  }

  let result: IngestSummary;
  try {
    result = await ingest(run, items);
  } catch (e) {
    return { run: finish({ status: "failed", error: e instanceof Error ? e.message : String(e) }), fallbackStarted: 0 };
  }
  const finished = finish({
    status: "ingested",
    enrichedCount: result.searched,
    ownerCount: result.found,
    costUsd: (remote.usageTotalUsd ?? 0) + result.llmCostUsd,
    error: null,
  });

  // Only now: this run no longer counts as in flight, so its businesses can be handed to the website reader.
  let fallbackStarted = 0;
  if (run.meta?.fallback) {
    const targets = fallbackTargets(result.notFound);
    if (targets.length > 0) {
      try {
        fallbackStarted = (await startEnrichment(targets)).count;
      } catch {
        /* the search results are already saved; the user can read websites by hand */
      }
    }
  }
  return { run: finished, fallbackStarted };
}

// ---------- reading ----------

export function getOwnerSearch(placeId: string): { record: OwnerSearchRecord; fetchedAt: Date } | null {
  const row = db
    .select()
    .from(enrichment)
    .where(and(eq(enrichment.placeId, placeId), eq(enrichment.kind, KIND)))
    .get();
  return row ? { record: row.data as unknown as OwnerSearchRecord, fetchedAt: row.fetchedAt } : null;
}
