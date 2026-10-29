import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { areas, nichePlaces, niches, placeRuns, places, runs } from "@/db/schema";
import { assignArea, areaShape } from "./areas";
import { normalizeItem, type NormalizedPlace, type Provenance } from "./normalize";
import { classifyByRules } from "./relevance";
import { rescoreNiche } from "./rescore";

type Raw = Record<string, unknown>;

export type IngestResult = { resultCount: number; newPlaceCount: number; newGlobalCount: number };

/**
 * Upsert places (global, keyed by placeId), record provenance, and attach the
 * places to the niche exactly once. A place seen again, or surfaced by an
 * overlapping area, is never duplicated.
 */
export function ingestItems(runId: number, items: Raw[]): IngestResult {
  const run = db.select().from(runs).where(eq(runs.id, runId)).get();
  if (!run) throw new Error(`Run ${runId} not found`);
  const area = db.select().from(areas).where(eq(areas.id, run.areaId)).get();
  if (!area) throw new Error(`Area ${run.areaId} not found`);
  const niche = db.select().from(niches).where(eq(niches.id, area.nicheId)).get();
  if (!niche) throw new Error(`Niche ${area.nicheId} not found`);

  const nicheAreas = db
    .select()
    .from(areas)
    .where(eq(areas.nicheId, niche.id))
    .all()
    .map((a) => ({ id: a.id, shape: areaShape(a) }));

  // First normalized row per placeId wins for the place; every (place, query) is kept for provenance.
  const uniquePlaces = new Map<string, NormalizedPlace>();
  const provRows: { placeId: string; prov: Provenance }[] = [];
  for (const raw of items) {
    const n = normalizeItem(raw);
    if (!n) continue;
    if (!uniquePlaces.has(n.place.placeId)) uniquePlaces.set(n.place.placeId, n.place);
    provRows.push({ placeId: n.place.placeId, prov: n.prov });
  }

  const knownPlaces = new Set(db.select({ id: places.placeId }).from(places).all().map((r) => r.id));
  const nicheRows = new Map(
    db
      .select({ placeId: nichePlaces.placeId, src: nichePlaces.relevanceSource })
      .from(nichePlaces)
      .where(eq(nichePlaces.nicheId, niche.id))
      .all()
      .map((r) => [r.placeId, r.src] as const),
  );

  const now = new Date();
  let newPlaceCount = 0;
  let newGlobalCount = 0;
  const reviewed: string[] = []; // places this run brought review data for

  db.transaction((tx) => {
    for (const p of uniquePlaces.values()) {
      if (!knownPlaces.has(p.placeId)) newGlobalCount++;
      const { placeId, imageUrl, thumbnailUrl, logoUrl, photosCount, reviewSample, ...fields } = p;
      const images = { imageUrl, thumbnailUrl, logoUrl, photosCount };
      if (reviewSample) reviewed.push(placeId);
      tx.insert(places)
        .values({ placeId, ...fields, ...images, reviewSample, reviewsSampledAt: reviewSample ? now : null, scrapedAt: now, firstSeenAt: now })
        .onConflictDoUpdate({
          target: places.placeId,
          set: {
            ...fields,
            // A re-sight without images (older run, trimmed fields) must not erase ones we have.
            imageUrl: sql`coalesce(excluded.image_url, ${places.imageUrl})`,
            thumbnailUrl: sql`coalesce(excluded.thumbnail_url, ${places.thumbnailUrl})`,
            logoUrl: sql`coalesce(excluded.logo_url, ${places.logoUrl})`,
            photosCount: sql`coalesce(excluded.photos_count, ${places.photosCount})`,
            // Same for reviews: a run that did not ask for them leaves an earlier sample alone, and one that did replaces it.
            reviewSample: sql`coalesce(excluded.review_sample, ${places.reviewSample})`,
            reviewsSampledAt: sql`case when excluded.review_sample is not null then excluded.reviews_sampled_at else ${places.reviewsSampledAt} end`,
            scrapedAt: now,
          },
        })
        .run();

      const rel = classifyByRules(p, niche.playbook);
      const areaId = assignArea(p, nicheAreas, area.id);
      if (!nicheRows.has(placeId)) {
        newPlaceCount++;
        tx.insert(nichePlaces)
          .values({
            nicheId: niche.id,
            placeId,
            areaId,
            relevance: rel.label,
            relevanceReason: rel.reason,
            relevanceSource: rel.label ? "rules" : null,
          })
          .run();
      } else if (nicheRows.get(placeId) !== "user" && nicheRows.get(placeId) !== "llm") {
        // Refresh rule-based relevance on re-sight; never clobber LLM or user decisions.
        tx.update(nichePlaces)
          .set({ relevance: rel.label, relevanceReason: rel.reason, relevanceSource: rel.label ? "rules" : null })
          .where(and(eq(nichePlaces.nicheId, niche.id), eq(nichePlaces.placeId, placeId)))
          .run();
      }
    }

    for (const { placeId, prov } of provRows) {
      tx.insert(placeRuns)
        .values({
          placeId,
          runId,
          query: prov.query,
          searchGridIndex: prov.searchGridIndex,
          searchLat: prov.searchLat,
          searchLng: prov.searchLng,
          firstSeenAt: now,
          lastSeenAt: now,
        })
        .onConflictDoUpdate({
          target: [placeRuns.placeId, placeRuns.runId, placeRuns.query],
          set: { lastSeenAt: now },
        })
        .run();
    }

    tx.update(runs)
      .set({ status: "ingested", resultCount: uniquePlaces.size, newPlaceCount })
      .where(eq(runs.id, runId))
      .run();
  });

  // Peer benchmarks span the whole niche, so score everything after each ingest.
  rescoreNiche(niche.id);

  // Review data belongs to the place, not the niche: any other niche tracking a place that just got reviews changes too.
  if (reviewed.length > 0) {
    const others = new Set<number>();
    for (let i = 0; i < reviewed.length; i += 500) {
      const rows = db.selectDistinct({ id: nichePlaces.nicheId }).from(nichePlaces).where(inArray(nichePlaces.placeId, reviewed.slice(i, i + 500))).all();
      for (const r of rows) others.add(r.id);
    }
    others.delete(niche.id);
    for (const id of others) rescoreNiche(id);
  }

  return { resultCount: uniquePlaces.size, newPlaceCount, newGlobalCount };
}
