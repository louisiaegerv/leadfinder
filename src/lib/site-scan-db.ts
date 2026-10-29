import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { contacts, enrichment, facebookProfiles, nichePlaces, placeRuns, places, settings } from "@/db/schema";
import { enrichableUrl } from "./enrich";
import { facebookPage } from "./facebook-search";
import { getEnrichment, resolveTargets, saveOwner, startEnrichment } from "./enrich-db";
import { nicheFilterWhere, type PlaceFilters } from "./queries";
import { rescoreNiche } from "./rescore";
import { safeGet, scanSite, type Fetcher, type Network, type SiteScan } from "./site-scan";
import type { ScanOutcome } from "./site-types";

const KIND = "site_scan";

/** Websites one click will scan. The scan is free, but each site is up to three requests. */
export const MAX_SCAN_PER_CLICK = 80;
const CONCURRENCY = 8;

// ---------- choosing who to scan ----------

export type ScanStats = { matching: number; eligible: number; alreadyDone: number; noWebsite: number; doNotContact: number };

/** Best-scoring businesses the table is showing that have a website and haven't been scanned. */
export function findScanCandidates(nicheId: number, f: PlaceFilters, limit: number) {
  const rows = db
    .select({
      placeId: places.placeId,
      website: places.website,
      domain: places.domain,
      dnc: contacts.doNotContact,
      scannedAt: enrichment.fetchedAt,
    })
    .from(nichePlaces)
    .innerJoin(places, eq(places.placeId, nichePlaces.placeId))
    .leftJoin(contacts, eq(contacts.placeId, nichePlaces.placeId))
    .leftJoin(enrichment, and(eq(enrichment.placeId, nichePlaces.placeId), eq(enrichment.kind, KIND)))
    .where(nicheFilterWhere(nicheId, f))
    .orderBy(sql`${nichePlaces.score} is null`, desc(nichePlaces.score))
    .all();

  const stats: ScanStats = { matching: rows.length, eligible: 0, alreadyDone: 0, noWebsite: 0, doNotContact: 0 };
  const ids: string[] = [];
  for (const r of rows) {
    if (r.dnc) stats.doNotContact++;
    else if (!enrichableUrl(r)) stats.noWebsite++;
    else if (r.scannedAt) stats.alreadyDone++;
    else ids.push(r.placeId);
  }
  stats.eligible = ids.length;
  return { stats, placeIds: ids.slice(0, limit) };
}

/** Businesses picked by hand. Scanning one again is allowed, since sites change. */
export function resolveScanTargets(placeIds: string[]): { placeIds: string[]; skipped: { placeId: string; reason: string }[] } {
  const rows = db
    .select({ placeId: places.placeId, website: places.website, domain: places.domain, dnc: contacts.doNotContact })
    .from(places)
    .leftJoin(contacts, eq(contacts.placeId, places.placeId))
    .where(inArray(places.placeId, placeIds))
    .all();
  const ok: string[] = [];
  const skipped: { placeId: string; reason: string }[] = [];
  for (const r of rows) {
    if (r.dnc) skipped.push({ placeId: r.placeId, reason: "marked do-not-contact" });
    else if (!enrichableUrl(r)) skipped.push({ placeId: r.placeId, reason: "no business website to scan" });
    else ok.push(r.placeId);
  }
  return { placeIds: ok, skipped };
}

// ---------- scanning ----------

export type ScanSummary = {
  scanned: number;
  outcomes: Partial<Record<ScanOutcome, number>>;
  withSocials: number;
  facebookFound: number;
  ownersFound: number;
  /** Sites the quick pass couldn't read (JavaScript-built, blocked, or erroring): the candidates for the paid reader. */
  needsBrowser: string[];
};

/** Outcomes the second (paid) pass could plausibly fix. A dead domain or refused address it can't. */
const NEEDS_BROWSER: ScanOutcome[] = ["blank", "blocked", "error"];

function save(placeId: string, scan: SiteScan): { facebook: boolean; owner: boolean } {
  return db.transaction((tx) => {
    const now = new Date();
    tx.insert(enrichment)
      .values({ placeId, kind: KIND, data: scan, source: "site-scan", confidence: null, fetchedAt: now })
      .onConflictDoUpdate({ target: [enrichment.placeId, enrichment.kind], set: { data: scan, source: "site-scan", fetchedAt: now } })
      .run();

    // A Facebook link on the business's own site is a strong match for its page; never override one you set.
    let facebook = false;
    const fb = scan.socials.facebook;
    if (fb) {
      const existing = tx.select().from(facebookProfiles).where(eq(facebookProfiles.placeId, placeId)).get();
      if (!existing) {
        tx.insert(facebookProfiles).values({ placeId, pageUrl: fb, pageId: facebookPage(fb)?.pageId ?? null, matchSource: "maps_website", matchConfidence: 0.8, userOverride: false }).run();
        facebook = true;
      } else if (!existing.userOverride && existing.matchSource !== "user" && existing.pageUrl !== fb) {
        tx.update(facebookProfiles).set({ pageUrl: fb, pageId: facebookPage(fb)?.pageId ?? null, matchSource: "maps_website", matchConfidence: 0.8 }).where(eq(facebookProfiles.placeId, placeId)).run();
        facebook = true;
      }
    }

    // A founder or owner named in the site's own structured data: first-party, so trusted at 0.8.
    const person = scan.people.find((p) => p.name.split(/\s+/).length >= 2);
    const owner = !!person && saveOwner(tx, placeId, person.name, 0.8, "site");
    return { facebook, owner };
  });
}

/**
 * Scan these businesses' websites with plain HTTP and save the results. Free. Results are saved
 * as each site finishes, so stopping midway keeps the progress; scores are refreshed at the end.
 */
export async function scanPlaces(placeIds: string[], opts: { fetcher?: Fetcher; concurrency?: number } = {}): Promise<ScanSummary> {
  const fetcher = opts.fetcher ?? safeGet;
  const rows = db
    .select({ placeId: places.placeId, website: places.website, domain: places.domain })
    .from(places)
    .where(inArray(places.placeId, placeIds))
    .all()
    .flatMap((r) => {
      const url = enrichableUrl(r);
      return url ? [{ placeId: r.placeId, url }] : [];
    });

  const summary: ScanSummary = { scanned: 0, outcomes: {}, withSocials: 0, facebookFound: 0, ownersFound: 0, needsBrowser: [] };
  let next = 0;
  const worker = async () => {
    while (next < rows.length) {
      const { placeId, url } = rows[next++];
      let scan: SiteScan;
      try {
        scan = await scanSite(url, fetcher);
      } catch {
        continue; // an unexpected parser failure on one site never stops the rest
      }
      const saved = save(placeId, scan);
      summary.scanned++;
      summary.outcomes[scan.outcome] = (summary.outcomes[scan.outcome] ?? 0) + 1;
      if (Object.keys(scan.socials).length) summary.withSocials++;
      if (saved.facebook) summary.facebookFound++;
      if (saved.owner) summary.ownersFound++;
      if (NEEDS_BROWSER.includes(scan.outcome)) summary.needsBrowser.push(placeId);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(opts.concurrency ?? CONCURRENCY, rows.length)) }, worker));

  // The new signals change the offer scores of every niche that tracks these businesses.
  const scannedIds = rows.map((r) => r.placeId);
  if (summary.scanned > 0 && scannedIds.length > 0) {
    const nicheIds = db.selectDistinct({ id: nichePlaces.nicheId }).from(nichePlaces).where(inArray(nichePlaces.placeId, scannedIds)).all();
    for (const n of nicheIds) rescoreNiche(n.id);
  }
  return summary;
}

/** The second pass: send the sites the quick scan couldn't read to the paid website reader, skipping ones already read. */
export async function startPaidSecondPass(placeIds: string[]) {
  const targets = resolveTargets(placeIds).targets.filter((t) => !getEnrichment(t.placeId));
  if (targets.length === 0) return null;
  return startEnrichment(targets);
}

// ---------- scanning automatically after a run ----------

/** Most websites one run scans on its own. Anything beyond that is left for the Enrich button. */
const AUTO_SCAN_MAX = 400;
const AUTO_CHUNK = 50;

export const autoScanEnabled = () => process.env.AUTO_SCAN_ON_INGEST !== "0";

export type AutoScanState =
  | { state: "scanning"; total: number; done: number }
  | { state: "done"; total: number; scanned: number; read: number; needsBrowser: number; unreachable: number; facebookFound: number; ownersFound: number }
  | { state: "interrupted"; total: number; done: number }
  | { state: "error"; message: string };

const key = (runId: number) => `autoscan:${runId}`;
const live = () => ((globalThis as unknown as { __autoScans?: Set<number> }).__autoScans ??= new Set<number>());

function setAutoScan(runId: number, value: AutoScanState) {
  db.insert(settings).values({ key: key(runId), value }).onConflictDoUpdate({ target: settings.key, set: { value } }).run();
}

/** Progress of a run's automatic scan. One that says "scanning" but isn't running in this process was cut off by a restart. */
export function getAutoScan(runId: number): AutoScanState | null {
  const row = db.select().from(settings).where(eq(settings.key, key(runId))).get();
  const v = row?.value as AutoScanState | undefined;
  if (!v) return null;
  return v.state === "scanning" && !live().has(runId) ? { state: "interrupted", total: v.total, done: v.done } : v;
}

/** Places this run surfaced that have a real website, no scan yet, and aren't do-not-contact. */
export function unscannedInRun(runId: number): string[] {
  const rows = db
    .selectDistinct({ placeId: places.placeId, website: places.website, domain: places.domain, dnc: contacts.doNotContact, scannedAt: enrichment.fetchedAt })
    .from(placeRuns)
    .innerJoin(places, eq(places.placeId, placeRuns.placeId))
    .leftJoin(contacts, eq(contacts.placeId, places.placeId))
    .leftJoin(enrichment, and(eq(enrichment.placeId, places.placeId), eq(enrichment.kind, KIND)))
    .where(eq(placeRuns.runId, runId))
    .all();
  return rows.filter((r) => !r.dnc && !r.scannedAt && enrichableUrl(r)).map((r) => r.placeId);
}

/**
 * Scan the new websites from a finished run in the background. Free, so it just runs. It never
 * touches the paid reader: sites it can't read are left for you to send. Returns the running
 * task (callers can ignore it; tests await it), or null if there was nothing to do.
 */
export function startAutoScan(runId: number, opts: { fetcher?: Fetcher } = {}): Promise<void> | null {
  if (!autoScanEnabled() || live().has(runId)) return null;
  let ids: string[];
  try {
    ids = unscannedInRun(runId).slice(0, AUTO_SCAN_MAX);
  } catch {
    return null; // never let this get in the way of the run finishing
  }
  if (ids.length === 0) return null;

  live().add(runId);
  setAutoScan(runId, { state: "scanning", total: ids.length, done: 0 });
  return (async () => {
    const t = { scanned: 0, read: 0, needsBrowser: 0, unreachable: 0, facebookFound: 0, ownersFound: 0 };
    try {
      for (let i = 0; i < ids.length; i += AUTO_CHUNK) {
        const chunk = ids.slice(i, i + AUTO_CHUNK);
        const s = await scanPlaces(chunk, { fetcher: opts.fetcher });
        t.scanned += s.scanned;
        t.read += s.outcomes.ok ?? 0;
        t.needsBrowser += s.needsBrowser.length;
        t.unreachable += (s.outcomes.dead ?? 0) + (s.outcomes.refused ?? 0) + (s.outcomes.not_html ?? 0);
        t.facebookFound += s.facebookFound;
        t.ownersFound += s.ownersFound;
        setAutoScan(runId, { state: "scanning", total: ids.length, done: Math.min(ids.length, i + chunk.length) });
      }
      setAutoScan(runId, { state: "done", total: ids.length, ...t });
    } catch (e) {
      setAutoScan(runId, { state: "error", message: e instanceof Error ? e.message : String(e) });
    } finally {
      live().delete(runId);
    }
  })();
}

// ---------- reading ----------

export function getSiteScan(placeId: string): { scan: SiteScan; fetchedAt: Date } | null {
  const row = db
    .select()
    .from(enrichment)
    .where(and(eq(enrichment.placeId, placeId), eq(enrichment.kind, KIND)))
    .get();
  return row ? { scan: row.data as unknown as SiteScan, fetchedAt: row.fetchedAt } : null;
}

export type ContactInfo = {
  emails: string[];
  phones: string[];
  socials: Partial<Record<Network, string>>;
};

/** Everything found about how to reach a business, from the quick scan and the paid reader together. */
export function getContactInfo(placeId: string): ContactInfo {
  const scan = getSiteScan(placeId)?.scan;
  const read = getEnrichment(placeId)?.profile;
  // The same number can be written several ways; keep one, preferring the formatted one over bare digits.
  const phones = new Map<string, string>();
  for (const p of [...(scan?.phones ?? []), ...(read?.phones ?? [])]) {
    const key = p.replace(/\D/g, "");
    const kept = phones.get(key);
    if (!kept || (/^\+?\d+$/.test(kept) && !/^\+?\d+$/.test(p))) phones.set(key, p);
  }
  return {
    emails: [...new Set([...(scan?.emails ?? []), ...(read?.emails ?? [])])],
    phones: [...phones.values()],
    socials: { ...(read?.socials as ContactInfo["socials"] | undefined), ...scan?.socials },
  };
}
