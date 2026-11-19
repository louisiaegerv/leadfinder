import { beforeAll, describe, expect, it } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { MAX_WEBSITE, parseManualWebsite } from "./website-manual";

const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "lf-webman-")), "t.db");
process.env.DATABASE_PATH = tmp;

describe("parseManualWebsite", () => {
  it("accepts an address with or without https, and works out the domain", () => {
    expect(parseManualWebsite("acmeepoxy.com")).toEqual({ website: "https://acmeepoxy.com/", domain: "acmeepoxy.com" });
    expect(parseManualWebsite("  http://www.AcmeEpoxy.com/about?x=1#team ")).toEqual({ website: "http://www.acmeepoxy.com/about?x=1", domain: "acmeepoxy.com" });
    expect(parseManualWebsite("www.acme.co.uk/contact")).toEqual({ website: "https://www.acme.co.uk/contact", domain: "acme.co.uk" });
  });

  it("treats empty text as none", () => {
    expect(parseManualWebsite("   ")).toBeNull();
    expect(parseManualWebsite(null)).toBeNull();
  });

  it("refuses what is not a website", () => {
    for (const bad of ["javascript:alert(1)", "ftp://acme.com", "mailto:a@acme.com", "localhost", "http://127.0.0.1/x", "just some words", "https://user:pw@acme.com", "acme"]) {
      expect(() => parseManualWebsite(bad), bad).toThrow(/website/);
    }
    expect(() => parseManualWebsite(`acme.com/${"x".repeat(MAX_WEBSITE)}`)).toThrow(/under/);
  });
});

describe("setManualWebsite", () => {
  let db: typeof import("@/db").db;
  let s: typeof import("@/db").schema;
  let w: typeof import("./website-manual-db");
  let ingest: typeof import("./ingest");
  let eq: typeof import("drizzle-orm").eq;
  let emptyPlaybook: typeof import("./playbook").emptyPlaybook;
  const place =(id: string) => db.select().from(s.places).where(eq(s.places.placeId, id)).get()!;
  const enrich = (id: string) => db.select().from(s.enrichment).where(eq(s.enrichment.placeId, id)).all().map((r) => r.kind).sort();

  beforeAll(async () => {
    ({ db, schema: s } = await import("@/db"));
    w = await import("./website-manual-db");
    ingest = await import("./ingest");
    ({ emptyPlaybook } = await import("./playbook"));
    ({ eq } = await import("drizzle-orm"));
  });

  const mk = (id: string, over: Partial<typeof s.places.$inferInsert> = {}) =>
    db.insert(s.places).values({ placeId: id, title: id, categories: [], scrapedAt: new Date(), ...over }).run();

  it("saves the site as yours", () => {
    mk("A");
    expect(w.setManualWebsite("A", "acmeepoxy.com")).toEqual({ website: "https://acmeepoxy.com/", domain: "acmeepoxy.com" });
    expect(place("A")).toMatchObject({ website: "https://acmeepoxy.com/", domain: "acmeepoxy.com", websiteManual: true });
  });

  it("drops what was read from the old site, but keeps other findings", () => {
    mk("B", { website: "https://old.com/", domain: "old.com" });
    const now = new Date();
    db.insert(s.enrichment).values(["site_scan", "profile", "owner_search", "facebook_search"].map((kind) => ({ placeId: "B", kind, data: {}, source: "t", fetchedAt: now }))).run();
    db.insert(s.pageTexts).values({ placeId: "B", text: Buffer.from("old"), fetchedAt: now }).run();
    w.setManualWebsite("B", "new.com");
    expect(enrich("B")).toEqual(["facebook_search", "owner_search"]);
    expect(db.select().from(s.pageTexts).where(eq(s.pageTexts.placeId, "B")).all()).toHaveLength(0);
  });

  it("keeps the scan when the same site is saved again", () => {
    mk("C", { website: "https://same.com/", domain: "same.com" });
    db.insert(s.enrichment).values({ placeId: "C", kind: "site_scan", data: {}, source: "t", fetchedAt: new Date() }).run();
    w.setManualWebsite("C", "https://same.com/");
    expect(enrich("C")).toEqual(["site_scan"]);
  });

  it("clears the site and lets Maps fill it in again", () => {
    mk("D", { website: "https://wrong.com/", domain: "wrong.com" });
    w.setManualWebsite("D", "right.com");
    expect(w.setManualWebsite("D", "  ")).toEqual({ website: null, domain: null });
    expect(place("D")).toMatchObject({ website: null, domain: null, websiteManual: false });
  });

  it("rejects bad input and unknown businesses without touching anything", () => {
    mk("E", { website: "https://keep.com/", domain: "keep.com" });
    expect(() => w.setManualWebsite("E", "not a site")).toThrow();
    expect(place("E").website).toBe("https://keep.com/");
    expect(() => w.setManualWebsite("NO-SUCH-PLACE", "acme.com")).toThrow();
  });

  it("survives Google Maps being searched again, while a site Maps listed is still refreshed", () => {
    const niche = db.insert(s.niches).values({ name: "t", target: "", playbook: emptyPlaybook() }).returning().get();
    const area = db.insert(s.areas).values({ nicheId: niche.id, name: "A", shape: "radius", centerLat: 30, centerLng: -95, radiusKm: 50, queries: ["q"] }).returning().get();
    const run = () => db.insert(s.runs).values({ areaId: area.id, inputs: {}, status: "succeeded" }).returning().get().id;
    const item = (id: string, website: string) => ({ title: id, placeId: id, categories: ["x"], location: { lat: 30, lng: -95 }, query: "q", searchGridIndex: 0, searchCenter: { lat: 30, lng: -95 }, website });

    ingest.ingestItems(run(), [item("M1", "https://maps-one.com/"), item("M2", "https://maps-two.com/")]);
    w.setManualWebsite("M1", "mine.com");
    ingest.ingestItems(run(), [item("M1", "https://maps-changed.com/"), item("M2", "https://maps-two-changed.com/")]);
    expect(place("M1")).toMatchObject({ website: "https://mine.com/", domain: "mine.com", websiteManual: true });
    expect(place("M2")).toMatchObject({ website: "https://maps-two-changed.com/", domain: "maps-two-changed.com", websiteManual: false });
  });
});