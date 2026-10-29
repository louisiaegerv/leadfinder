import { and, asc, desc, eq, isNull, like, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { areas, contacts, facebookProfiles, nichePlaces, niches, placeRuns, places, runs } from "@/db/schema";
import { OFFERS, STAGES, type OfferKey, type Stage } from "./offers";

export function listNiches() {
  return db
    .select({
      id: niches.id,
      name: niches.name,
      target: niches.target,
      areaCount: sql<number>`(select count(*) from ${areas} where ${areas.nicheId} = ${niches.id})`,
      placeCount: sql<number>`(select count(*) from ${nichePlaces} where ${nichePlaces.nicheId} = ${niches.id})`,
      targetCount: sql<number>`(select count(*) from ${nichePlaces} where ${nichePlaces.nicheId} = ${niches.id} and ${nichePlaces.relevance} = 'target')`,
    })
    .from(niches)
    .orderBy(desc(niches.createdAt))
    .all();
}

export const getNiche = (id: number) => db.select().from(niches).where(eq(niches.id, id)).get();

export const getAreas = (nicheId: number) =>
  db.select().from(areas).where(eq(areas.nicheId, nicheId)).orderBy(areas.id).all();

export const getArea = (nicheId: number, areaId: number) =>
  db.select().from(areas).where(and(eq(areas.id, areaId), eq(areas.nicheId, nicheId))).get();

export function getRuns(nicheId: number) {
  return db
    .select({ run: runs, areaName: areas.name })
    .from(runs)
    .innerJoin(areas, eq(areas.id, runs.areaId))
    .where(eq(areas.nicheId, nicheId))
    .orderBy(desc(runs.id))
    .all();
}

/** A few photo-bearing, well-reviewed places to show as a visual on a niche card. */
export function getNicheThumbs(nicheId: number, limit = 4) {
  return db
    .select({
      placeId: places.placeId,
      title: places.title,
      imageUrl: places.imageUrl,
      thumbnailUrl: places.thumbnailUrl,
    })
    .from(nichePlaces)
    .innerJoin(places, eq(places.placeId, nichePlaces.placeId))
    .where(
      and(
        eq(nichePlaces.nicheId, nicheId),
        eq(nichePlaces.relevance, "target"),
        sql`${places.imageUrl} is not null and ${places.imageUrl} not like '%streetviewpixels%'`,
      ),
    )
    .orderBy(desc(places.reviewsCount))
    .limit(limit)
    .all();
}

export function getNichePlaces(nicheId: number, limit = 500) {
  return db
    .select({
      placeId: places.placeId,
      title: places.title,
      categories: places.categories,
      city: places.city,
      phone: places.phone,
      website: places.website,
      domain: places.domain,
      totalScore: places.totalScore,
      reviewsCount: places.reviewsCount,
      imageUrl: places.imageUrl,
      thumbnailUrl: places.thumbnailUrl,
      logoUrl: places.logoUrl,
      photosCount: places.photosCount,
      relevance: nichePlaces.relevance,
      relevanceReason: nichePlaces.relevanceReason,
      stage: nichePlaces.stage,
      areaName: areas.name,
    })
    .from(nichePlaces)
    .innerJoin(places, eq(places.placeId, nichePlaces.placeId))
    .leftJoin(areas, eq(areas.id, nichePlaces.areaId))
    .where(eq(nichePlaces.nicheId, nicheId))
    .orderBy(desc(places.reviewsCount))
    .limit(limit)
    .all();
}

// ---------- results table / map / detail ----------

export const REL_FILTERS = ["pipeline", "target", "adjacent", "gray", "noise", "all"] as const;
export type RelFilter = (typeof REL_FILTERS)[number];
export const SORT_KEYS = ["score", "reviews", "rating", "title", "area"] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export const PAGE_SIZE = 50;

export type PlaceFilters = {
  rel: RelFilter;
  stage?: Stage;
  areaId?: number;
  offer?: OfferKey;
  q?: string;
  sort: SortKey;
  dir: "asc" | "desc";
  page: number;
};

type RawParams = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Parse and clamp URL search params so a hand-edited URL can never break a query. */
export function parseFilters(sp: RawParams): PlaceFilters {
  const rel = one(sp.rel) as RelFilter;
  const sort = one(sp.sort) as SortKey;
  const offer = one(sp.offer) as OfferKey;
  const stage = one(sp.stage) as Stage;
  const areaId = Number(one(sp.area));
  return {
    rel: REL_FILTERS.includes(rel) ? rel : "pipeline",
    areaId: Number.isInteger(areaId) && areaId > 0 ? areaId : undefined,
    offer: OFFERS.includes(offer) ? offer : undefined,
    stage: STAGES.includes(stage) ? stage : undefined,
    q: one(sp.q)?.trim() || undefined,
    sort: SORT_KEYS.includes(sort) ? sort : "score",
    dir: one(sp.dir) === "asc" ? "asc" : "desc",
    page: Math.max(1, Number(one(sp.page)) || 1),
  };
}

function where(nicheId: number, f: PlaceFilters): SQL {
  const conds: (SQL | undefined)[] = [eq(nichePlaces.nicheId, nicheId)];
  if (f.rel === "pipeline") conds.push(or(eq(nichePlaces.relevance, "target"), eq(nichePlaces.relevance, "adjacent"), isNull(nichePlaces.relevance)));
  else if (f.rel === "gray") conds.push(isNull(nichePlaces.relevance));
  else if (f.rel !== "all") conds.push(eq(nichePlaces.relevance, f.rel));
  if (f.areaId) conds.push(eq(nichePlaces.areaId, f.areaId));
  if (f.offer) conds.push(eq(nichePlaces.leadOffer, f.offer));
  if (f.stage) conds.push(eq(nichePlaces.stage, f.stage));
  if (f.q) conds.push(like(places.title, `%${f.q.replace(/[%_]/g, "")}%`));
  return and(...conds)!;
}

/** The table's filters as a SQL condition, so other features can act on exactly the rows you are looking at. */
export { where as nicheFilterWhere };

const SORT_COLUMN = {
  score: nichePlaces.score,
  reviews: places.reviewsCount,
  rating: places.totalScore,
  title: places.title,
  area: areas.name,
} as const;

export function queryNichePlaces(nicheId: number, f: PlaceFilters) {
  const col = SORT_COLUMN[f.sort];
  const dir = f.dir === "asc" ? asc : desc;
  const base = db
    .select({
      placeId: places.placeId,
      title: places.title,
      categories: places.categories,
      city: places.city,
      phone: places.phone,
      domain: places.domain,
      totalScore: places.totalScore,
      reviewsCount: places.reviewsCount,
      photosCount: places.photosCount,
      imageUrl: places.imageUrl,
      thumbnailUrl: places.thumbnailUrl,
      logoUrl: places.logoUrl,
      relevance: nichePlaces.relevance,
      relevanceReason: nichePlaces.relevanceReason,
      relevanceSource: nichePlaces.relevanceSource,
      score: nichePlaces.score,
      leadOffer: nichePlaces.leadOffer,
      runnerUpOffer: nichePlaces.runnerUpOffer,
      stage: nichePlaces.stage,
      areaName: areas.name,
      doNotContact: contacts.doNotContact,
      ownerName: contacts.ownerName,
    })
    .from(nichePlaces)
    .innerJoin(places, eq(places.placeId, nichePlaces.placeId))
    .leftJoin(areas, eq(areas.id, nichePlaces.areaId))
    .leftJoin(contacts, eq(contacts.placeId, nichePlaces.placeId))
    .where(where(nicheId, f));

  const rows = base
    // NULLs last whichever way we sort, then a stable tiebreak.
    .orderBy(sql`${col} is null`, dir(col), asc(places.title))
    .limit(PAGE_SIZE)
    .offset((f.page - 1) * PAGE_SIZE)
    .all();

  const total = db
    .select({ n: sql<number>`count(*)` })
    .from(nichePlaces)
    .innerJoin(places, eq(places.placeId, nichePlaces.placeId))
    .where(where(nicheId, f))
    .get()!.n;

  return { rows, total, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

/** Counts by relevance for the summary strip (unaffected by table filters). */
export function getRelevanceCounts(nicheId: number) {
  const rows = db
    .select({ relevance: nichePlaces.relevance, n: sql<number>`count(*)` })
    .from(nichePlaces)
    .where(eq(nichePlaces.nicheId, nicheId))
    .groupBy(nichePlaces.relevance)
    .all();
  const c = { target: 0, adjacent: 0, noise: 0, gray: 0, total: 0 };
  for (const r of rows) {
    c[r.relevance ?? "gray"] += r.n;
    c.total += r.n;
  }
  return c;
}

export function getMapPoints(nicheId: number, f: PlaceFilters, limit = 3000) {
  return db
    .select({
      placeId: places.placeId,
      title: places.title,
      lat: places.lat,
      lng: places.lng,
      score: nichePlaces.score,
      leadOffer: nichePlaces.leadOffer,
      relevance: nichePlaces.relevance,
    })
    .from(nichePlaces)
    .innerJoin(places, eq(places.placeId, nichePlaces.placeId))
    .where(and(where(nicheId, f), sql`${places.lat} is not null and ${places.lng} is not null`))
    .orderBy(desc(nichePlaces.score))
    .limit(limit)
    .all();
}

export function getPlaceDetail(nicheId: number, placeId: string) {
  const row = db
    .select({ place: places, np: nichePlaces, areaName: areas.name, contact: contacts, fb: facebookProfiles })
    .from(nichePlaces)
    .innerJoin(places, eq(places.placeId, nichePlaces.placeId))
    .leftJoin(areas, eq(areas.id, nichePlaces.areaId))
    .leftJoin(contacts, eq(contacts.placeId, nichePlaces.placeId))
    .leftJoin(facebookProfiles, eq(facebookProfiles.placeId, nichePlaces.placeId))
    .where(and(eq(nichePlaces.nicheId, nicheId), eq(nichePlaces.placeId, placeId)))
    .get();
  if (!row) return null;

  const found = db
    .select({
      runId: placeRuns.runId,
      query: placeRuns.query,
      gridIndex: placeRuns.searchGridIndex,
      areaName: areas.name,
    })
    .from(placeRuns)
    .innerJoin(runs, eq(runs.id, placeRuns.runId))
    .innerJoin(areas, eq(areas.id, runs.areaId))
    .where(and(eq(placeRuns.placeId, placeId), eq(areas.nicheId, nicheId)))
    .all();

  // How many other niches also track this business (shared contact history).
  const otherNiches = db
    .select({ id: niches.id, name: niches.name })
    .from(nichePlaces)
    .innerJoin(niches, eq(niches.id, nichePlaces.nicheId))
    .where(and(eq(nichePlaces.placeId, placeId), sql`${nichePlaces.nicheId} != ${nicheId}`))
    .all();

  return { ...row, found, otherNiches };
}

export function getNicheAreasLite(nicheId: number) {
  return db.select({ id: areas.id, name: areas.name }).from(areas).where(eq(areas.nicheId, nicheId)).orderBy(areas.id).all();
}
