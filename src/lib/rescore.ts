import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { facebookProfiles, nichePlaces, niches, places, settings } from "@/db/schema";
import { playbookSchema } from "./playbook";
import { classifyByRules } from "./relevance";
import { SCORING_VERSION, buildPeerLookup, scorePlace, type ScoreInput } from "./scoring";

/**
 * Backfill scores when they are missing (rows that predate scoring) or were made
 * by older scoring rules. A cheap check, so it is safe to call on page loads.
 */
export function ensureScored(): void {
  const stored = db.select().from(settings).where(eq(settings.key, "scoringVersion")).get();
  const unscored = db
    .select({ n: sql<number>`count(*)` })
    .from(nichePlaces)
    .where(isNull(nichePlaces.score))
    .get()!.n;
  if (stored?.value === SCORING_VERSION && unscored === 0) return;

  for (const n of db.select({ id: niches.id }).from(niches).all()) rescoreNiche(n.id);
  db.insert(settings)
    .values({ key: "scoringVersion", value: SCORING_VERSION })
    .onConflictDoUpdate({ target: settings.key, set: { value: SCORING_VERSION } })
    .run();
}

/**
 * After a playbook edit, re-run the category/keyword rules over rows whose
 * relevance came from rules (or is undecided). LLM and user decisions are kept.
 */
export function reclassifyNiche(nicheId: number): number {
  const niche = db.select().from(niches).where(eq(niches.id, nicheId)).get();
  if (!niche) return 0;
  const pb = playbookSchema.parse(niche.playbook);
  const rows = db
    .select({
      placeId: nichePlaces.placeId,
      src: nichePlaces.relevanceSource,
      title: places.title,
      categories: places.categories,
      domain: places.domain,
    })
    .from(nichePlaces)
    .innerJoin(places, eq(places.placeId, nichePlaces.placeId))
    .where(eq(nichePlaces.nicheId, nicheId))
    .all()
    .filter((r) => r.src === null || r.src === "rules");

  db.transaction((tx) => {
    for (const r of rows) {
      const rel = classifyByRules(r, pb);
      tx.update(nichePlaces)
        .set({ relevance: rel.label, relevanceReason: rel.reason, relevanceSource: rel.label ? "rules" : null })
        .where(and(eq(nichePlaces.nicheId, nicheId), eq(nichePlaces.placeId, r.placeId)))
        .run();
    }
  });
  return rows.length;
}

/**
 * Recompute score, per-offer fit, lead offer and runner-up for every place in a
 * niche. Peer benchmarks depend on the whole niche, so this always runs over all
 * of it. Cheap enough (thousands of rows) to call after every ingest, playbook
 * edit or relevance change.
 */
export function rescoreNiche(nicheId: number): number {
  const niche = db.select().from(niches).where(eq(niches.id, nicheId)).get();
  if (!niche) return 0;
  const pb = playbookSchema.parse(niche.playbook);

  const rows = db
    .select({
      placeId: nichePlaces.placeId,
      areaId: nichePlaces.areaId,
      relevance: nichePlaces.relevance,
      postalCode: places.postalCode,
      categories: places.categories,
      domain: places.domain,
      website: places.website,
      phone: places.phone,
      totalScore: places.totalScore,
      reviewsCount: places.reviewsCount,
      photosCount: places.photosCount,
      permanentlyClosed: places.permanentlyClosed,
      temporarilyClosed: places.temporarilyClosed,
      openingHours: places.openingHours,
      bookingLinks: places.bookingLinks,
      facebookState: facebookProfiles.state,
    })
    .from(nichePlaces)
    .innerJoin(places, eq(places.placeId, nichePlaces.placeId))
    .leftJoin(facebookProfiles, eq(facebookProfiles.placeId, nichePlaces.placeId))
    .where(eq(nichePlaces.nicheId, nicheId))
    .all();

  const inputs: (ScoreInput & { placeId: string })[] = rows;
  const peers = buildPeerLookup(inputs);

  db.transaction((tx) => {
    for (const input of inputs) {
      const r = scorePlace(input, pb, peers(input));
      tx.update(nichePlaces)
        .set({
          score: r.score,
          scoreBreakdown: r.breakdown,
          offerScores: r.offers,
          leadOffer: r.leadOffer,
          runnerUpOffer: r.runnerUpOffer,
        })
        .where(and(eq(nichePlaces.nicheId, nicheId), eq(nichePlaces.placeId, input.placeId)))
        .run();
    }
  });
  return inputs.length;
}
