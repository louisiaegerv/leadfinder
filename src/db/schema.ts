import {
  sqliteTable,
  text,
  integer,
  real,
  primaryKey,
  index,
} from "drizzle-orm/sqlite-core";
import type { Playbook } from "@/lib/playbook";
import type { OfferKey } from "@/lib/offers";

const ts = (name: string) => integer(name, { mode: "timestamp_ms" });
const now = () => new Date();

/** Global: one row per Google place, shared by every niche. */
export const places = sqliteTable(
  "places",
  {
    placeId: text("place_id").primaryKey(),
    // cid is 19+ digits: always TEXT, a JS number would lose precision.
    cid: text("cid"),
    title: text("title").notNull(),
    categories: text("categories", { mode: "json" }).$type<string[]>().notNull(),
    address: text("address"),
    street: text("street"),
    city: text("city"),
    state: text("state"),
    postalCode: text("postal_code"),
    countryCode: text("country_code"),
    phone: text("phone"),
    website: text("website"),
    domain: text("domain"),
    totalScore: real("total_score"), // star rating
    reviewsCount: integer("reviews_count"),
    permanentlyClosed: integer("permanently_closed", { mode: "boolean" }),
    temporarilyClosed: integer("temporarily_closed", { mode: "boolean" }),
    lat: real("lat"),
    lng: real("lng"),
    // Feed speed-to-lead signals (hours gaps, no booking link).
    // Image URLs only (Google-hosted); nothing is downloaded. photosCount feeds the "few photos" gap signal.
    imageUrl: text("image_url"),
    thumbnailUrl: text("thumbnail_url"),
    logoUrl: text("logo_url"),
    photosCount: integer("photos_count"),
    openingHours: text("opening_hours", { mode: "json" }).$type<Record<string, string>>(),
    bookingLinks: text("booking_links", { mode: "json" }).$type<string[]>(),
    scrapedAt: ts("scraped_at").notNull(),
    firstSeenAt: ts("first_seen_at").notNull().$defaultFn(now),
  },
  (t) => [index("places_domain_idx").on(t.domain), index("places_cid_idx").on(t.cid)],
);

export const niches = sqliteTable("niches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  presetKey: text("preset_key"),
  /** Plain-language definition of who we are looking for. */
  target: text("target").notNull().default(""),
  playbook: text("playbook", { mode: "json" }).$type<Playbook>().notNull(),
  createdAt: ts("created_at").notNull().$defaultFn(now),
});

export const areas = sqliteTable("areas", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nicheId: integer("niche_id")
    .notNull()
    .references(() => niches.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  // radius OR polygon, never both (enforced in lib/areas.ts)
  shape: text("shape", { enum: ["radius", "polygon"] }).notNull(),
  centerLat: real("center_lat"),
  centerLng: real("center_lng"),
  radiusKm: real("radius_km"),
  polygon: text("polygon", { mode: "json" }).$type<[number, number][]>(), // [lat,lng]
  gridSpacingKm: real("grid_spacing_km").notNull().default(8),
  queries: text("queries", { mode: "json" }).$type<string[]>().notNull(),
  // Run setup, saved with the area so a launch uses what was last saved.
  num: integer("num").notNull().default(500),
  skipClosedPlaces: integer("skip_closed_places", { mode: "boolean" }).notNull().default(true),
  gl: text("gl").notNull().default("us"),
  hl: text("hl").notNull().default("en"),
  createdAt: ts("created_at").notNull().$defaultFn(now),
});

export const runs = sqliteTable("runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  areaId: integer("area_id")
    .notNull()
    .references(() => areas.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["full", "probe"] }).notNull().default("full"),
  apifyRunId: text("apify_run_id"),
  datasetId: text("dataset_id"),
  inputs: text("inputs", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
  status: text("status", {
    enum: ["pending", "running", "succeeded", "failed", "aborted", "ingested"],
  })
    .notNull()
    .default("pending"),
  estimatedCostUsd: real("estimated_cost_usd"),
  estimatedPoints: integer("estimated_points"),
  costUsd: real("cost_usd"),
  resultCount: integer("result_count"),
  newPlaceCount: integer("new_place_count"),
  error: text("error"),
  startedAt: ts("started_at"),
  finishedAt: ts("finished_at"),
  createdAt: ts("created_at").notNull().$defaultFn(now),
});

/** Provenance: which run / query / grid point surfaced which place. */
export const placeRuns = sqliteTable(
  "place_runs",
  {
    placeId: text("place_id")
      .notNull()
      .references(() => places.placeId, { onDelete: "cascade" }),
    runId: integer("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    query: text("query").notNull(),
    searchGridIndex: integer("search_grid_index"),
    searchLat: real("search_lat"),
    searchLng: real("search_lng"),
    firstSeenAt: ts("first_seen_at").notNull().$defaultFn(now),
    lastSeenAt: ts("last_seen_at").notNull().$defaultFn(now),
  },
  (t) => [primaryKey({ columns: [t.placeId, t.runId, t.query] })],
);

export const nichePlaces = sqliteTable(
  "niche_places",
  {
    nicheId: integer("niche_id")
      .notNull()
      .references(() => niches.id, { onDelete: "cascade" }),
    placeId: text("place_id")
      .notNull()
      .references(() => places.placeId, { onDelete: "cascade" }),
    areaId: integer("area_id").references(() => areas.id, { onDelete: "set null" }),
    relevance: text("relevance", { enum: ["target", "adjacent", "noise"] }),
    relevanceReason: text("relevance_reason"),
    relevanceSource: text("relevance_source", { enum: ["rules", "llm", "user"] }),
    score: real("score"),
    offerScores: text("offer_scores", { mode: "json" }).$type<
      Partial<Record<OfferKey, { score: number; evidence: string[] }>>
    >(),
    /** Why the overall score is what it is: the four parts plus notes. */
    scoreBreakdown: text("score_breakdown", { mode: "json" }).$type<{
      fit: number;
      capacity: number;
      gaps: number;
      reachability: number;
      notes: string[];
    }>(),
    leadOffer: text("lead_offer").$type<OfferKey>(),
    runnerUpOffer: text("runner_up_offer").$type<OfferKey>(),
    stage: text("stage", {
      enum: ["new", "dialed", "conversation", "booked", "held", "proposal", "won", "lost"],
    })
      .notNull()
      .default("new"),
    tags: text("tags", { mode: "json" }).$type<string[]>(),
    createdAt: ts("created_at").notNull().$defaultFn(now),
  },
  (t) => [
    primaryKey({ columns: [t.nicheId, t.placeId] }),
    index("niche_places_area_idx").on(t.areaId),
  ],
);

/** One owner record per business, shared across niches. */
export const contacts = sqliteTable("contacts", {
  placeId: text("place_id")
    .primaryKey()
    .references(() => places.placeId, { onDelete: "cascade" }),
  ownerName: text("owner_name"),
  phone: text("phone"),
  source: text("source"),
  confidence: real("confidence"),
  doNotContact: integer("do_not_contact", { mode: "boolean" }).notNull().default(false),
  updatedAt: ts("updated_at").notNull().$defaultFn(now),
});

export const contactLog = sqliteTable("contact_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  placeId: text("place_id")
    .notNull()
    .references(() => places.placeId, { onDelete: "cascade" }),
  nicheId: integer("niche_id").references(() => niches.id, { onDelete: "set null" }),
  outcome: text("outcome").notNull(),
  notes: text("notes"),
  objection: text("objection"),
  offer: text("offer").$type<OfferKey>(),
  followUp: ts("follow_up"),
  createdAt: ts("created_at").notNull().$defaultFn(now),
});

/** One Apify enrichment run over a batch of business websites (maps each URL back to its place). */
export const enrichmentRuns = sqliteTable("enrichment_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  apifyRunId: text("apify_run_id"),
  datasetId: text("dataset_id"),
  /** "site" reads each business's website; "search" googles for the owner and has a model read the snippets. */
  kind: text("kind", { enum: ["site", "search"] }).notNull().default("site"),
  /** "ingesting" is held while results are applied, so two pollers never do the work (and the model spend) twice. */
  status: text("status", { enum: ["running", "ingesting", "ingested", "failed", "aborted"] })
    .notNull()
    .default("running"),
  targets: text("targets", { mode: "json" }).$type<{ placeId: string; url: string }[]>().notNull(),
  /** Search runs: the queries sent per place, and whether to read websites for the ones not found. */
  meta: text("meta", { mode: "json" }).$type<{ queries: Record<string, string[]>; fallback: boolean }>(),
  enrichedCount: integer("enriched_count"),
  ownerCount: integer("owner_count"),
  costUsd: real("cost_usd"),
  error: text("error"),
  createdAt: ts("created_at").notNull().$defaultFn(now),
  finishedAt: ts("finished_at"),
});

/** Generic enrichment cache keyed by place_id (+ kind). */
export const enrichment = sqliteTable(
  "enrichment",
  {
    placeId: text("place_id")
      .notNull()
      .references(() => places.placeId, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // e.g. owner, reviews
    data: text("data", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    source: text("source").notNull(),
    confidence: real("confidence"),
    fetchedAt: ts("fetched_at").notNull().$defaultFn(now),
  },
  (t) => [primaryKey({ columns: [t.placeId, t.kind] })],
);

/** Facebook page match + Ad Library state per business (pipeline stages 3 and 4). */
export const facebookProfiles = sqliteTable("facebook_profiles", {
  placeId: text("place_id")
    .primaryKey()
    .references(() => places.placeId, { onDelete: "cascade" }),
  pageUrl: text("page_url"),
  matchSource: text("match_source", { enum: ["maps_website", "search", "user"] }),
  matchConfidence: real("match_confidence"),
  userOverride: integer("user_override", { mode: "boolean" }).notNull().default(false),
  state: text("state", {
    enum: ["no_page", "page_no_ads", "active_ads", "active_ads_weak_landing"],
  }),
  adLibrary: text("ad_library", { mode: "json" }).$type<{
    activeAds: number;
    oldestStart?: string;
    cta?: string[];
    landingUrls?: string[];
    creativeCount?: number;
    platforms?: string[];
  }>(),
  checkedAt: ts("checked_at"),
});

/** Signed clients. Direct competitors in the same area get locked. */
export const clients = sqliteTable("clients", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nicheId: integer("niche_id")
    .notNull()
    .references(() => niches.id, { onDelete: "cascade" }),
  areaId: integer("area_id")
    .notNull()
    .references(() => areas.id, { onDelete: "cascade" }),
  placeId: text("place_id")
    .notNull()
    .references(() => places.placeId, { onDelete: "cascade" }),
  signedAt: ts("signed_at").notNull().$defaultFn(now),
});

/** Cache for LLM calls (relevance, keyword ideas, pitch briefs). */
export const llmCache = sqliteTable("llm_cache", {
  key: text("key").primaryKey(), // hash of task + inputs
  task: text("task").notNull(),
  response: text("response", { mode: "json" }).$type<unknown>().notNull(),
  model: text("model").notNull(),
  costUsd: real("cost_usd"),
  createdAt: ts("created_at").notNull().$defaultFn(now),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).$type<unknown>().notNull(),
});

export type Place = typeof places.$inferSelect;
export type Niche = typeof niches.$inferSelect;
export type Area = typeof areas.$inferSelect;
export type Run = typeof runs.$inferSelect;
