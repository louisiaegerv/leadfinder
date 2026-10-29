import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { contacts, enrichment, facebookProfiles, nichePlaces, places } from "@/db/schema";
import { placesInFlight } from "./enrich-db";
import { facebookPage, facebookQuery, matchFacebook, type FacebookSearchRecord, type FbCandidate } from "./facebook-search";
import { MAX_SEARCH_PER_CLICK, SEARCH_PAGE_USD, snippetsFrom } from "./owner-search";
import { loadPlaces, startSearchRuns, syncSearchRun, type SearchIngest, type SearchStats } from "./owner-search-db";
import { nicheFilterWhere, type PlaceFilters } from "./queries";

const KIND = "facebook_search";

/** About half a cent for ten businesses: one search each, no model involved. */
export const FACEBOOK_PER_BUSINESS_USD = SEARCH_PAGE_USD;
export { MAX_SEARCH_PER_CLICK as MAX_FACEBOOK_PER_CLICK };

// ---------- choosing who to search for ----------

/** Best-scoring businesses the table is showing that have no Facebook page yet and haven't been searched. */
export function findFacebookCandidates(nicheId: number, f: PlaceFilters, limit: number) {
  const inFlight = placesInFlight();
  const rows = db
    .select({
      placeId: places.placeId,
      dnc: contacts.doNotContact,
      pageUrl: facebookProfiles.pageUrl,
      searchedAt: enrichment.fetchedAt,
    })
    .from(nichePlaces)
    .innerJoin(places, eq(places.placeId, nichePlaces.placeId))
    .leftJoin(contacts, eq(contacts.placeId, nichePlaces.placeId))
    .leftJoin(facebookProfiles, eq(facebookProfiles.placeId, nichePlaces.placeId))
    .leftJoin(enrichment, and(eq(enrichment.placeId, nichePlaces.placeId), eq(enrichment.kind, KIND)))
    .where(nicheFilterWhere(nicheId, f))
    .orderBy(sql`${nichePlaces.score} is null`, desc(nichePlaces.score))
    .all();

  const stats: SearchStats = { matching: rows.length, eligible: 0, alreadyDone: 0, doNotContact: 0, inProgress: 0, withWebsite: 0 };
  const ids: string[] = [];
  for (const r of rows) {
    if (r.dnc) stats.doNotContact++;
    else if (r.pageUrl || r.searchedAt) stats.alreadyDone++; // a page found on their site, or already searched
    else if (inFlight.has(r.placeId)) stats.inProgress++;
    else ids.push(r.placeId);
  }
  stats.eligible = ids.length;
  return { stats, placeIds: ids.slice(0, limit) };
}

/** Businesses picked by hand. Searching again for one already searched is allowed; one with a page already is not. */
export function resolveFacebookTargets(placeIds: string[]): { placeIds: string[]; skipped: { placeId: string; reason: string }[] } {
  const inFlight = placesInFlight();
  const rows = db
    .select({ placeId: places.placeId, dnc: contacts.doNotContact, pageUrl: facebookProfiles.pageUrl })
    .from(places)
    .leftJoin(contacts, eq(contacts.placeId, places.placeId))
    .leftJoin(facebookProfiles, eq(facebookProfiles.placeId, places.placeId))
    .where(inArray(places.placeId, placeIds))
    .all();
  const ok: string[] = [];
  const skipped: { placeId: string; reason: string }[] = [];
  for (const r of rows) {
    if (r.dnc) skipped.push({ placeId: r.placeId, reason: "marked do-not-contact" });
    else if (r.pageUrl) skipped.push({ placeId: r.placeId, reason: "already has a Facebook page" });
    else if (inFlight.has(r.placeId)) skipped.push({ placeId: r.placeId, reason: "already being looked up" });
    else ok.push(r.placeId);
  }
  return { placeIds: ok, skipped };
}

export const startFacebookSearch = (placeIds: string[]) => startSearchRuns(placeIds, "facebook", (p) => [facebookQuery(p)], { fallback: false });

// ---------- saving what was found ----------

const sameUrl = (a: string | null, b: string) => !!a && a.replace(/\/+$/, "").toLowerCase() === b.replace(/\/+$/, "").toLowerCase();

/**
 * Record the page as the business's Facebook profile. A page you set yourself is never replaced, and a page
 * linked from the business's own website (the strongest evidence) is kept over one found by search.
 */
function saveFacebookProfile(tx: Pick<typeof db, "select" | "insert" | "update">, placeId: string, best: FbCandidate): void {
  const existing = tx.select().from(facebookProfiles).where(eq(facebookProfiles.placeId, placeId)).get();
  if (!existing) {
    tx.insert(facebookProfiles).values({ placeId, pageUrl: best.url, pageId: best.pageId, matchSource: "search", matchConfidence: best.confidence, userOverride: false }).run();
    return;
  }
  if (existing.userOverride || existing.matchSource === "user") return;
  if (existing.matchSource === "maps_website") {
    // The site's own link wins. If search found the same page, it can still tell us the page id.
    if (sameUrl(existing.pageUrl, best.url) && !existing.pageId && best.pageId) {
      tx.update(facebookProfiles).set({ pageId: best.pageId }).where(eq(facebookProfiles.placeId, placeId)).run();
    }
    return;
  }
  if (!existing.pageUrl || best.confidence >= (existing.matchConfidence ?? 0)) {
    tx.update(facebookProfiles).set({ pageUrl: best.url, pageId: best.pageId, matchSource: "search", matchConfidence: best.confidence }).where(eq(facebookProfiles.placeId, placeId)).run();
  }
}

/**
 * Turn a finished Facebook search run into pages. No model: the match is decided by plain code. A page is saved
 * only when it clearly belongs to the business; "searched, nothing clear" is recorded so it isn't searched again by accident.
 */
export const ingestFacebookRun: SearchIngest = async (run, rows) => {
  const meta = run.meta;
  if (!meta) throw new Error("Search run has no query details");
  const byId = new Map(loadPlaces(run.targets.map((t) => t.placeId)).map((p) => [p.placeId, p]));

  let found = 0;
  const notFound: string[] = [];
  db.transaction((tx) => {
    for (const t of run.targets) {
      const place = byId.get(t.placeId);
      if (!place) continue;
      const queries = meta.queries[t.placeId] ?? [];
      const snippets = snippetsFrom(rows, queries);
      const m = matchFacebook(place, snippets);
      const record: FacebookSearchRecord = { query: queries[0] ?? "", snippetCount: snippets.length, best: m.best, candidates: m.candidates };
      const now = new Date();
      tx.insert(enrichment)
        .values({ placeId: t.placeId, kind: KIND, data: record, source: "google-search", confidence: m.best?.confidence ?? null, fetchedAt: now })
        .onConflictDoUpdate({ target: [enrichment.placeId, enrichment.kind], set: { data: record, source: "google-search", confidence: m.best?.confidence ?? null, fetchedAt: now } })
        .run();
      if (m.best) {
        saveFacebookProfile(tx, t.placeId, m.best);
        found++;
      } else notFound.push(t.placeId);
    }
  });
  return { searched: run.targets.length, found, llmCostUsd: 0, notFound };
};

export const syncFacebook = (id: number) => syncSearchRun(id, ingestFacebookRun);

// ---------- reading ----------

export function getFacebookSearch(placeId: string): { record: FacebookSearchRecord; fetchedAt: Date } | null {
  const row = db
    .select()
    .from(enrichment)
    .where(and(eq(enrichment.placeId, placeId), eq(enrichment.kind, KIND)))
    .get();
  return row ? { record: row.data as unknown as FacebookSearchRecord, fetchedAt: row.fetchedAt } : null;
}

/** Re-exported so the site scan can fill the page id the same way. */
export { facebookPage };
