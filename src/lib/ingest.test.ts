import { beforeAll, describe, expect, it } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

// Point the db at a throwaway file before the module loads.
const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "lf-")), "t.db");
process.env.DATABASE_PATH = tmp;

let db: typeof import("@/db").db;
let s: typeof import("@/db").schema;
let ingestItems: typeof import("./ingest").ingestItems;
let emptyPlaybook: typeof import("./playbook").emptyPlaybook;
let eq: typeof import("drizzle-orm").eq;

beforeAll(async () => {
  ({ db, schema: s } = await import("@/db"));
  ({ ingestItems } = await import("./ingest"));
  ({ emptyPlaybook } = await import("./playbook"));
  ({ eq } = await import("drizzle-orm"));
});

function seed(areaDefs: { name: string; lat: number; lng: number; km: number }[]) {
  const pb = { ...emptyPlaybook(), includeCategories: ["Concrete contractor"], includeKeywords: ["concrete"] };
  const niche = db.insert(s.niches).values({ name: "t", target: "", playbook: pb }).returning().get();
  const ar = areaDefs.map((a) =>
    db
      .insert(s.areas)
      .values({ nicheId: niche.id, name: a.name, shape: "radius", centerLat: a.lat, centerLng: a.lng, radiusKm: a.km, queries: ["q"] })
      .returning()
      .get(),
  );
  return { niche, areas: ar };
}
const mkRun = (areaId: number) =>
  db.insert(s.runs).values({ areaId, inputs: {}, status: "succeeded" }).returning().get();

const item = (id: string, over: Record<string, unknown> = {}) => ({
  title: `Biz ${id}`,
  placeId: id,
  cid: "16644497406215546755",
  categories: ["Concrete contractor"],
  location: { lat: 30.08, lng: -95.42 },
  query: "q",
  searchGridIndex: 0,
  searchCenter: { lat: 30.08, lng: -95.42 },
  ...over,
});

describe("ingestItems", () => {
  it("dedupes within a run, stores cid as exact text, and records provenance", () => {
    const { niche, areas } = seed([{ name: "A", lat: 30.08, lng: -95.42, km: 20 }]);
    const run = mkRun(areas[0].id);
    const res = ingestItems(run.id, [item("p1"), item("p1", { query: "q2" }), item("p2")]);
    expect(res).toMatchObject({ resultCount: 2, newPlaceCount: 2 });
    expect(db.select().from(s.places).where(eq(s.places.placeId, "p1")).get()!.cid).toBe("16644497406215546755");
    const prov = db.select().from(s.placeRuns).where(eq(s.placeRuns.placeId, "p1")).all();
    expect(prov.map((p) => p.query).sort()).toEqual(["q", "q2"]);
    expect(db.select().from(s.nichePlaces).where(eq(s.nichePlaces.nicheId, niche.id)).all()).toHaveLength(2);
  });

  it("a second run re-seeing a place does not duplicate it or count it as new", () => {
    const { areas } = seed([{ name: "A", lat: 30.08, lng: -95.42, km: 20 }]);
    ingestItems(mkRun(areas[0].id).id, [item("dup1")]);
    const second = ingestItems(mkRun(areas[0].id).id, [item("dup1"), item("dup2")]);
    expect(second).toMatchObject({ resultCount: 2, newPlaceCount: 1 });
    expect(db.select().from(s.places).where(eq(s.places.placeId, "dup1")).all()).toHaveLength(1);
  });

  it("overlapping areas: one place, one niche row, assigned to one area", () => {
    const { niche, areas } = seed([
      { name: "East", lat: 30.08, lng: -95.4, km: 15 },
      { name: "West", lat: 30.08, lng: -95.5, km: 15 },
    ]);
    // This place sits inside both circles; surfaced by the West run.
    ingestItems(mkRun(areas[1].id).id, [item("ov1", { location: { lat: 30.08, lng: -95.45 } })]);
    ingestItems(mkRun(areas[0].id).id, [item("ov1", { location: { lat: 30.08, lng: -95.45 } })]);
    const rows = db.select().from(s.nichePlaces).where(eq(s.nichePlaces.nicheId, niche.id)).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].areaId).toBe(areas[1].id);
  });

  it("scores on ingest, and one business keeps independent relevance and score per niche", () => {
    const concrete = { ...emptyPlaybook(), includeCategories: ["Concrete contractor"], includeKeywords: ["concrete"] };
    const suppliers = { ...emptyPlaybook(), includeCategories: ["Paint store"], includeKeywords: ["paint"] };
    const mk = (name: string, pb: typeof concrete) => {
      const niche = db.insert(s.niches).values({ name, target: "", playbook: pb }).returning().get();
      const area = db
        .insert(s.areas)
        .values({ nicheId: niche.id, name: "A", shape: "radius", centerLat: 30.08, centerLng: -95.42, radiusKm: 20, queries: ["q"] })
        .returning()
        .get();
      return { niche, area };
    };
    const a = mk("contractors", concrete);
    const b = mk("suppliers", suppliers);
    const shared = item("shared1", { title: "Acme Concrete", reviewsCount: 80, totalScore: 4.5, website: "https://acme.com", domain: "acme.com", phoneUnformatted: "+17135550100" });
    ingestItems(mkRun(a.area.id).id, [shared]);
    ingestItems(mkRun(b.area.id).id, [shared]);

    const rowA = db.select().from(s.nichePlaces).where(eq(s.nichePlaces.nicheId, a.niche.id)).get()!;
    const rowB = db.select().from(s.nichePlaces).where(eq(s.nichePlaces.nicheId, b.niche.id)).get()!;
    expect(rowA.relevance).toBe("target");
    expect(rowB.relevance).toBe("noise");
    expect(rowA.score).toBeGreaterThan(0);
    expect(rowB.score).toBe(0); // rescoring niche B must not have touched niche A's row, or vice versa
    expect(rowA.offerScores).not.toBeNull();
    expect(rowA.scoreBreakdown).toMatchObject({ fit: 1 });
    expect(rowB.scoreBreakdown).toMatchObject({ fit: 0 });
  });

  it("ensureScored backfills rows that have no score, then leaves a current db alone", async () => {
    const { ensureScored } = await import("./rescore");
    const { niche, areas } = seed([{ name: "A", lat: 30.08, lng: -95.42, km: 20 }]);
    ingestItems(mkRun(areas[0].id).id, [item("bf1")]);
    db.update(s.nichePlaces).set({ score: null, offerScores: null, leadOffer: null }).where(eq(s.nichePlaces.nicheId, niche.id)).run();
    ensureScored();
    const row = db.select().from(s.nichePlaces).where(eq(s.nichePlaces.nicheId, niche.id)).get()!;
    expect(row.score).not.toBeNull();
    expect(row.offerScores).not.toBeNull();
    expect(db.select().from(s.settings).where(eq(s.settings.key, "scoringVersion")).get()?.value).toBeTypeOf("number");

    // A current db is not recomputed: a deliberately odd stored score survives.
    db.update(s.nichePlaces).set({ score: 77 }).where(eq(s.nichePlaces.nicheId, niche.id)).run();
    ensureScored();
    expect(db.select().from(s.nichePlaces).where(eq(s.nichePlaces.nicheId, niche.id)).get()!.score).toBe(77);
  });

  it("stores image fields and keeps them when a later run returns none", () => {
    const { areas } = seed([{ name: "A", lat: 30.08, lng: -95.42, km: 20 }]);
    const photo = "https://lh3.googleusercontent.com/grass-cs/abc";
    ingestItems(mkRun(areas[0].id).id, [item("img1", { imageUrl: photo, imagesCount: 12 })]);
    // Older/trimmed run re-sees the place without image fields.
    ingestItems(mkRun(areas[0].id).id, [item("img1")]);
    const row = db.select().from(s.places).where(eq(s.places.placeId, "img1")).get()!;
    expect(row).toMatchObject({ imageUrl: photo, photosCount: 12 });
    // A newer value still wins.
    ingestItems(mkRun(areas[0].id).id, [item("img1", { imageUrl: `${photo}2`, imagesCount: 13 })]);
    expect(db.select().from(s.places).where(eq(s.places.placeId, "img1")).get()).toMatchObject({
      imageUrl: `${photo}2`,
      photosCount: 13,
    });
  });

  it("relevance is per niche and keeps user overrides on re-sight", () => {
    const { niche, areas } = seed([{ name: "A", lat: 30.08, lng: -95.42, km: 20 }]);
    ingestItems(mkRun(areas[0].id).id, [item("rv1")]);
    db.update(s.nichePlaces)
      .set({ relevance: "noise", relevanceSource: "user" })
      .where(eq(s.nichePlaces.placeId, "rv1"))
      .run();
    ingestItems(mkRun(areas[0].id).id, [item("rv1")]);
    const row = db.select().from(s.nichePlaces).where(eq(s.nichePlaces.nicheId, niche.id)).get()!;
    expect(row).toMatchObject({ relevance: "noise", relevanceSource: "user" });
  });
});
