import { beforeAll, describe, expect, it } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "lf-costs-")), "t.db");
process.env.DATABASE_PATH = tmp;
process.env.OPENROUTER_API_KEY = "test-key";
process.env.OPENROUTER_MODEL = "test/model";

let costs: typeof import("./niche-costs");

beforeAll(async () => {
  const { db, schema: s } = await import("@/db");
  costs = await import("./niche-costs");
  const { emptyPlaybook } = await import("./playbook");
  const { cacheKey, classifierNiche } = await import("./graylist");
  const now = new Date();

  const epoxy = db.insert(s.niches).values({ name: "Epoxy", target: "Epoxy installers", playbook: emptyPlaybook() }).returning().get();
  const other = db.insert(s.niches).values({ name: "Roofing", target: "", playbook: emptyPlaybook() }).returning().get();
  const area = db.insert(s.areas).values({ nicheId: epoxy.id, name: "Houston", shape: "radius", centerLat: 1, centerLng: 1, radiusKm: 5, queries: ["epoxy"] } as never).returning().get();
  const otherArea = db.insert(s.areas).values({ nicheId: other.id, name: "Dallas", shape: "radius", centerLat: 1, centerLng: 1, radiusKm: 5, queries: ["roof"] } as never).returning().get();

  db.insert(s.places).values(["A", "B", "C"].map((placeId) => ({ placeId, title: `Biz ${placeId}`, categories: ["Remodeler"], scrapedAt: now }))).run();
  db.insert(s.nichePlaces).values([
    { nicheId: epoxy.id, placeId: "A", areaId: area.id, relevance: "target" },
    { nicheId: epoxy.id, placeId: "B", areaId: area.id, relevance: "noise", relevanceSource: "llm" },
    { nicheId: epoxy.id, placeId: "C", areaId: area.id, relevance: "adjacent", relevanceSource: "llm" },
    { nicheId: other.id, placeId: "C", areaId: otherArea.id, relevance: "target" },
  ] as never).run();

  db.insert(s.runs).values([
    { areaId: area.id, inputs: {}, status: "ingested", costUsd: 1.5 },
    { areaId: area.id, inputs: {}, status: "running", estimatedCostUsd: 0.4 },
    { areaId: otherArea.id, inputs: {}, status: "ingested", costUsd: 9 },
  ]).run();

  const target = (...ids: string[]) => ids.map((placeId) => ({ placeId, url: "" }));
  db.insert(s.enrichmentRuns).values([
    { kind: "site", targets: target("A", "B"), costUsd: 0.2 },
    { kind: "reviews", targets: target("A", "C"), costUsd: 0.5 }, // split with Roofing, which has C
    { kind: "search", targets: target("C"), costUsd: 3 }, // only Roofing's... but C is also in Epoxy
    { kind: "facebook", targets: target("Z"), costUsd: 7 }, // nobody here
    { kind: "site", targets: target("A"), costUsd: null }, // not finished
  ] as never).run();

  const niche = classifierNiche(epoxy);
  for (const [placeId, title] of [["B", "Biz B"], ["C", "Biz C"]]) {
    db.insert(s.llmCache).values({ key: cacheKey(niche, { placeId, title, categories: ["Remodeler"], domain: null }), task: "relevance", response: {}, model: "m", costUsd: 0.01 }).run();
  }
});

describe("getNicheCosts", () => {
  it("sums only this niche's scrapes and leaves out ones that have not finished", () => {
    const c = costs.getNicheCosts(1);
    expect(c.scrapeUsd).toBe(1.5);
    expect(c.inFlightUsd).toBe(0.4);
  });

  it("counts enrichment runs by the share of their businesses in the niche", () => {
    const c = costs.getNicheCosts(1);
    const line = (k: string) => c.lines.find((l) => l.key === k)!;
    expect(line("site").costUsd).toBeCloseTo(0.2);
    expect(line("reviews").costUsd).toBeCloseTo(0.5); // A and C are both in Epoxy
    expect(line("search").costUsd).toBeCloseTo(3);
    expect(line("facebook").costUsd).toBe(0);
    expect(c.reviewsUsd).toBeCloseTo(0.5);
    expect(c.enrichmentUsd).toBeCloseTo(3.2);
  });

  it("splits a run that reached another niche's businesses", () => {
    const c = costs.getNicheCosts(2); // Roofing only has C
    expect(c.lines.find((l) => l.key === "reviews")!.costUsd).toBeCloseTo(0.25);
    expect(c.sharedRuns).toBe(1);
    expect(c.scrapeUsd).toBe(9);
  });

  it("finds the model's relevance checks again from the cache", () => {
    const c = costs.getNicheCosts(1);
    expect(c.aiUsd).toBeCloseTo(0.02);
    expect(c.lines.find((l) => l.key === "relevance")!.count).toBe(2);
    expect(c.totalUsd).toBeCloseTo(1.5 + 3.2 + 0.5 + 0.02);
  });

  it("works out per-prospect figures without counting noise", () => {
    const c = costs.getNicheCosts(1);
    expect(c.prospects).toBe(2);
    expect(c.targets).toBe(1);
  });
});
