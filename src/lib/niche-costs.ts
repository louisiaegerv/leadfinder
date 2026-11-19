import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { areas, enrichmentRuns, llmCache, nichePlaces, niches, places, runs } from "@/db/schema";
import { cacheKey, classifierNiche } from "./graylist";
import { getRelevanceCounts } from "./queries";

export type CostLine = {
  key: "maps" | "site" | "search" | "facebook" | "reviews" | "relevance";
  label: string;
  hint: string;
  costUsd: number;
  /** Runs (or, for relevance, businesses) behind the number. */
  count: number;
};

export type NicheCosts = {
  lines: CostLine[];
  totalUsd: number;
  scrapeUsd: number;
  enrichmentUsd: number;
  reviewsUsd: number;
  aiUsd: number;
  /** Estimated cost of scrapes that have not finished, so not in the totals yet. */
  inFlightUsd: number;
  /** Runs whose cost was split with another niche because they covered businesses from both. */
  sharedRuns: number;
  prospects: number;
  targets: number;
};

const ENRICH_LINES = [
  { key: "site", label: "Website reading", hint: "Reads each business's own website" },
  { key: "search", label: "Owner search", hint: "Web search plus the model that reads it" },
  { key: "facebook", label: "Facebook search", hint: "Finds the Facebook page and checks its ads" },
  { key: "reviews", label: "Review fetch", hint: "Pulls recent reviews for businesses already found" },
] as const;

/**
 * What the AI relevance checks for this niche cost. The cache is keyed by a hash of the niche
 * definition and the business, with no niche id, so the keys are rebuilt for the businesses the
 * model labelled. If the niche has been edited since, older checks no longer match and are left out.
 */
function relevanceCost(nicheId: number): { usd: number; count: number } {
  const niche = db.select().from(niches).where(eq(niches.id, nicheId)).get();
  if (!niche) return { usd: 0, count: 0 };
  const shape = classifierNiche(niche);
  const rows = db
    .select({ placeId: places.placeId, title: places.title, categories: places.categories, domain: places.domain })
    .from(nichePlaces)
    .innerJoin(places, eq(places.placeId, nichePlaces.placeId))
    .where(and(eq(nichePlaces.nicheId, nicheId), eq(nichePlaces.relevanceSource, "llm")))
    .all();
  const keys = [...new Set(rows.map((r) => cacheKey(shape, r)))];
  let usd = 0;
  let count = 0;
  for (let i = 0; i < keys.length; i += 500) {
    const hits = db
      .select({ cost: llmCache.costUsd })
      .from(llmCache)
      .where(and(eq(llmCache.task, "relevance"), inArray(llmCache.key, keys.slice(i, i + 500))))
      .all();
    for (const h of hits) usd += h.cost ?? 0;
    count += hits.length;
  }
  return { usd, count };
}

export function getNicheCosts(nicheId: number): NicheCosts {
  const scrapes = db
    .select({ costUsd: runs.costUsd, estimatedCostUsd: runs.estimatedCostUsd })
    .from(runs)
    .innerJoin(areas, eq(areas.id, runs.areaId))
    .where(eq(areas.nicheId, nicheId))
    .all();
  const billed = scrapes.filter((r) => r.costUsd != null);
  const inFlightUsd = scrapes.filter((r) => r.costUsd == null).reduce((sum, r) => sum + (r.estimatedCostUsd ?? 0), 0);

  // Enrichment runs cover businesses and are not tied to a niche, so each run's cost is split by
  // how many of its businesses belong to this niche (a business can be in several niches).
  const mine = new Set(
    db.select({ id: nichePlaces.placeId }).from(nichePlaces).where(eq(nichePlaces.nicheId, nicheId)).all().map((r) => r.id),
  );
  const spent: Record<string, { usd: number; count: number }> = {};
  let sharedRuns = 0;
  for (const run of db.select().from(enrichmentRuns).where(sql`${enrichmentRuns.costUsd} is not null`).all()) {
    const ids = [...new Set(run.targets.map((t) => t.placeId))];
    const inNiche = ids.filter((id) => mine.has(id)).length;
    if (inNiche === 0) continue;
    const share = inNiche / ids.length;
    if (share < 1) sharedRuns++;
    const line = (spent[run.kind] ??= { usd: 0, count: 0 });
    line.usd += (run.costUsd ?? 0) * share;
    line.count++;
  }

  const ai = relevanceCost(nicheId);
  const lines: CostLine[] = [
    {
      key: "maps",
      label: "Google Maps scrapes",
      hint: "Finding businesses, including any reviews asked for in the same run",
      costUsd: billed.reduce((sum, r) => sum + (r.costUsd ?? 0), 0),
      count: billed.length,
    },
    ...ENRICH_LINES.map((l) => ({ ...l, costUsd: spent[l.key]?.usd ?? 0, count: spent[l.key]?.count ?? 0 })),
    { key: "relevance", label: "AI relevance checks", hint: "The model sorting undecided businesses into target, adjacent or noise", costUsd: ai.usd, count: ai.count },
  ];

  const usd = (...keys: CostLine["key"][]) => lines.filter((l) => keys.includes(l.key)).reduce((sum, l) => sum + l.costUsd, 0);
  const counts = getRelevanceCounts(nicheId);
  return {
    lines,
    totalUsd: lines.reduce((sum, l) => sum + l.costUsd, 0),
    scrapeUsd: usd("maps"),
    enrichmentUsd: usd("site", "search", "facebook"),
    reviewsUsd: usd("reviews"),
    aiUsd: usd("relevance"),
    inFlightUsd,
    sharedRuns,
    prospects: counts.total - counts.noise,
    targets: counts.target,
  };
}
