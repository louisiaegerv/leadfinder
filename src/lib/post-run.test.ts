import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { emptyPlaybook } from "./playbook";

const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "lf-post-")), "t.db");
process.env.DATABASE_PATH = tmp;
process.env.APIFY_TOKEN = "test-token";
process.env.APIFY_API_BASE = "https://apify.test/v2";

describe("paid searches ticked for a run", () => {
  let db: typeof import("@/db").db;
  let s: typeof import("@/db").schema;
  let pr: typeof import("./post-run");
  let eq: typeof import("drizzle-orm").eq;
  let nicheId = 0;
  let areaId = 0;
  const posts: { url: string; body: Record<string, unknown> }[] = [];
  let failApify = false;
  let seq = 0;

  const newRun = () => db.insert(s.runs).values({ areaId, inputs: {}, status: "ingested" }).returning().get().id;
  const mk = (runId: number, id: string, over: Record<string, unknown> = {}) => {
    db.insert(s.places).values({ placeId: id, title: `Biz ${id}`, categories: [], scrapedAt: new Date(), city: "Spring", state: "Texas", countryCode: "US", website: `https://${id.toLowerCase()}.com`, domain: `${id.toLowerCase()}.com`, ...over }).run();
    db.insert(s.nichePlaces).values({ nicheId, placeId: id, relevance: "target", score: 50 }).run();
    db.insert(s.placeRuns).values({ placeId: id, runId, query: "q" }).run();
  };
  const kinds = () => posts.map((p) => (p.url.includes("business-profile") ? "site" : String(p.body.keyword).includes("Facebook") ? "facebook" : "search"));

  beforeAll(async () => {
    vi.stubGlobal("fetch", async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST" && url.includes("/runs")) {
        if (failApify) return new Response("quota exceeded", { status: 402 });
        posts.push({ url, body: JSON.parse(String(init.body)) });
        const id = `r${++seq}`;
        return new Response(JSON.stringify({ data: { id, status: "READY", defaultDatasetId: `ds-${id}` } }), { status: 200 });
      }
      return new Response("nope", { status: 404 });
    });
    ({ db, schema: s } = await import("@/db"));
    pr = await import("./post-run");
    ({ eq } = await import("drizzle-orm"));
    nicheId = db.insert(s.niches).values({ name: "N", target: "", playbook: emptyPlaybook() }).returning().get().id;
    areaId = db.insert(s.areas).values({ nicheId, name: "A", shape: "radius", centerLat: 30, centerLng: -95, radiusKm: 10, queries: ["q"] }).returning().get().id;
  });
  afterAll(() => vi.unstubAllGlobals());
  beforeEach(() => {
    posts.length = 0;
    failApify = false;
  });

  it("remembers nothing when nothing is ticked, and what was ticked when something is", () => {
    const none = newRun();
    pr.savePostRunOptions(none, { searchOwners: false, searchFacebook: false });
    expect(pr.getPostRun(none)).toBeNull();
    const some = newRun();
    pr.savePostRunOptions(some, { searchOwners: true, searchFacebook: false });
    expect(pr.getPostRun(some)).toEqual({ searchOwners: true, searchFacebook: false });
  });

  it("starts nothing, and spends nothing, for a run where neither was ticked", async () => {
    const run = newRun();
    mk(run, "NOTICK1");
    mk(run, "NOTICK2");
    pr.savePostRunOptions(run, { searchOwners: false, searchFacebook: false });
    expect(await pr.startPostRunSearches(run)).toBeNull();
    expect(posts).toHaveLength(0);
  });

  it("starts only the search that was ticked, never the paid website reader", async () => {
    const owners = newRun();
    mk(owners, "OWN1");
    mk(owners, "OWN2");
    pr.savePostRunOptions(owners, { searchOwners: true, searchFacebook: false });
    expect(await pr.startPostRunSearches(owners)).toMatchObject({ started: { owners: 2, facebook: 0 } });
    expect(kinds()).toEqual(["search"]);
    expect(db.select().from(s.enrichmentRuns).all().at(-1)!.meta!.fallback).toBe(false); // the fallback is a second purchase, made by hand

    posts.length = 0;
    const fbOnly = newRun();
    mk(fbOnly, "FBO1");
    pr.savePostRunOptions(fbOnly, { searchOwners: false, searchFacebook: true });
    expect(await pr.startPostRunSearches(fbOnly)).toMatchObject({ started: { owners: 0, facebook: 1 } });
    expect(kinds()).toEqual(["facebook"]);
  });

  it("starts both when both were ticked, and only once however many times it is called", async () => {
    const run = newRun();
    mk(run, "BOTH1");
    mk(run, "BOTH2");
    pr.savePostRunOptions(run, { searchOwners: true, searchFacebook: true });
    expect(await pr.startPostRunSearches(run)).toMatchObject({ started: { owners: 2, facebook: 2 } });
    expect(kinds().sort()).toEqual(["facebook", "search"]);
    const before = posts.length;
    expect(await pr.startPostRunSearches(run)).toMatchObject({ started: { owners: 2, facebook: 2 } });
    expect(posts.length).toBe(before);
  });

  it("leaves out places that already have the answer, or must not be contacted", async () => {
    const run = newRun();
    mk(run, "NEED"); // needs both
    mk(run, "HASPAGE"); // already has a Facebook page
    mk(run, "HASOWNER"); // owner confirmed
    mk(run, "TYPED"); // owner typed by hand
    mk(run, "GUESS"); // owner is only a guess: still worth searching
    mk(run, "DONE"); // searched before
    mk(run, "DNC");
    db.insert(s.facebookProfiles).values({ placeId: "HASPAGE", pageUrl: "https://www.facebook.com/x", matchSource: "maps_website", userOverride: false }).run();
    db.insert(s.contacts).values({ placeId: "HASOWNER", ownerName: "Jane Doe", source: "search", confidence: 0.9 }).run();
    db.insert(s.contacts).values({ placeId: "TYPED", ownerName: "Typed Name", source: "manual", confidence: 1 }).run();
    db.insert(s.contacts).values({ placeId: "GUESS", ownerName: "Maybe Person", source: "enrichment", confidence: 0.5 }).run();
    db.insert(s.contacts).values({ placeId: "DNC", doNotContact: true }).run();
    for (const kind of ["owner_search", "facebook_search"]) {
      db.insert(s.enrichment).values({ placeId: "DONE", kind, data: {}, source: "t", fetchedAt: new Date() }).run();
    }
    const need = pr.placesNeeding(run);
    expect(need.owners.sort()).toEqual(["GUESS", "HASPAGE", "NEED"]);
    expect(need.facebook.sort()).toEqual(["GUESS", "HASOWNER", "NEED", "TYPED"]);
  });

  it("does not search places an earlier run is already searching", async () => {
    const first = newRun();
    mk(first, "BUSY1");
    pr.savePostRunOptions(first, { searchOwners: true, searchFacebook: false });
    await pr.startPostRunSearches(first);
    posts.length = 0;
    const second = newRun();
    db.insert(s.placeRuns).values({ placeId: "BUSY1", runId: second, query: "q" }).run(); // seen again by a second run
    mk(second, "FRESH1");
    pr.savePostRunOptions(second, { searchOwners: true, searchFacebook: false });
    expect(await pr.startPostRunSearches(second)).toMatchObject({ started: { owners: 1, facebook: 0 } });
    expect(String(posts[0].body.keyword)).toContain("Biz FRESH1");
    expect(String(posts[0].body.keyword)).not.toContain("Biz BUSY1");
  });

  it("records a failure instead of throwing, so the run itself is never undone", async () => {
    const run = newRun();
    mk(run, "FAIL1");
    pr.savePostRunOptions(run, { searchOwners: true, searchFacebook: true });
    failApify = true;
    const state = await pr.startPostRunSearches(run);
    expect(state!.started).toEqual({ owners: 0, facebook: 0 });
    expect(state!.errors).toHaveLength(2);
    expect(state!.errors![0]).toContain("Owner search");
    expect(state!.errors![1]).toContain("Facebook search");
    expect(db.select().from(s.runs).where(eq(s.runs.id, run)).get()!.status).toBe("ingested");
  });
});
