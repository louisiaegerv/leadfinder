import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { buildPlaceIdsInput } from "./apify";
import { estimateReviewFetchUsd } from "./geo";
import { emptyPlaybook } from "./playbook";

const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "lf-rev-")), "t.db");
process.env.DATABASE_PATH = tmp;
process.env.APIFY_TOKEN = "test-token";
process.env.APIFY_API_BASE = "https://apify.test/v2";
process.env.APIFY_PLAN = "starter";

const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
const rv = (id: string, d: number, extra: Record<string, unknown> = {}) => ({ reviewId: id, stars: 5, text: `review ${id}`, publishedAtDate: daysAgo(d), responseFromOwnerText: null, ...extra });

describe("the place-id request", () => {
  it("names the places and the reviews, and nothing about a search area", () => {
    const input = buildPlaceIdsInput({ placeIds: ["ChIJ___DzNHOQIYRpn7XLHcOSrc", "ChIJ4a3tTg7d5QQRQvRoF9mqEJw"], maxReviews: 5, gl: "us", hl: "en" });
    expect(input).toEqual({
      placeIds: ["ChIJ___DzNHOQIYRpn7XLHcOSrc", "ChIJ4a3tTg7d5QQRQvRoF9mqEJw"],
      reviews: true,
      maxReviews: 5,
      reviewsSort: "newest",
      gl: "us",
      hl: "en",
      fields: "placeId,title,totalScore,reviewsCount,reviews",
    });
    for (const k of ["query", "latitude", "longitude", "radiusKm", "polygon", "gridSpacingKm", "num", "boundingBox", "startUrls"]) expect(input).not.toHaveProperty(k);
  });

  it("prices a fetch as the per-place charge plus the reviews, far under re-running an area", () => {
    expect(estimateReviewFetchUsd(100, 5, "starter")).toBeCloseTo(100 * 0.00045 + 0.00005 + 100 * 5 * 0.00025, 6); // $0.17
    expect(estimateReviewFetchUsd(0, 5, "starter")).toBe(0);
    expect(estimateReviewFetchUsd(1, 5, "starter")).toBeLessThan(0.002);
  });
});

describe("fetching reviews for specific places", () => {
  let db: typeof import("@/db").db;
  let s: typeof import("@/db").schema;
  let rf: typeof import("./reviews-fetch-db");
  let ed: typeof import("./enrich-db");
  let eq: typeof import("drizzle-orm").eq;
  let nicheX = 0;
  let nicheY = 0;
  const posts: { url: string; body: Record<string, unknown> }[] = [];
  let polls = 0;
  let remote = "RUNNING";
  let dataset: unknown[] = [];

  const mk = (id: string, title: string, over: Record<string, unknown> = {}, niches = [nicheX]) => {
    db.insert(s.places).values({ placeId: id, title, categories: ["Flooring contractor"], scrapedAt: new Date(), city: "Spring", state: "Texas", countryCode: "US", website: `https://${id.toLowerCase()}.com`, domain: `${id.toLowerCase()}.com`, phone: "+17135550100", reviewsCount: 120, totalScore: 4.5, ...over }).run();
    for (const n of niches) db.insert(s.nichePlaces).values({ nicheId: n, placeId: id, relevance: "target", score: 50 }).run();
  };
  const place = (id: string) => db.select().from(s.places).where(eq(s.places.placeId, id)).get()!;

  beforeAll(async () => {
    vi.stubGlobal("fetch", async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      const json = (v: unknown) => new Response(JSON.stringify(v), { status: 200, headers: { "Content-Type": "application/json" } });
      if (init?.method === "POST" && url.includes("google-maps-scraper")) {
        posts.push({ url, body: JSON.parse(String(init.body)) });
        const id = `m${posts.length}`;
        return json({ data: { id, status: "READY", defaultDatasetId: `ds-${id}` } });
      }
      if (url.includes("/actor-runs/")) {
        polls++;
        return json({ data: { id: "m1", status: remote, defaultDatasetId: "ds-m1", usageTotalUsd: 0.0123 } });
      }
      if (url.includes("/datasets/ds-m1/items")) return json(dataset);
      return new Response("nope", { status: 404 });
    });
    ({ db, schema: s } = await import("@/db"));
    rf = await import("./reviews-fetch-db");
    ed = await import("./enrich-db");
    ({ eq } = await import("drizzle-orm"));
    nicheX = db.insert(s.niches).values({ name: "X", target: "", playbook: emptyPlaybook() }).returning().get().id;
    nicheY = db.insert(s.niches).values({ name: "Y", target: "", playbook: emptyPlaybook() }).returning().get().id;
    mk("A", "Acme Epoxy", {}, [nicheX, nicheY]); // tracked by two niches
    mk("B", "Bee Floors"); // will come back with no reviews at all
    mk("C", "Cee Coatings"); // will come back without a reviews field
    mk("D", "Dee Polishing"); // will not come back at all
    mk("E", "Eh Epoxy", { countryCode: "CA" });
    mk("DNC", "No Calls");
    mk("DONE", "Already Sampled", { reviewSample: [{ id: "x", stars: 5, at: daysAgo(10), text: null, replied: false }], reviewsSampledAt: new Date() });
    db.insert(s.contacts).values({ placeId: "DNC", doNotContact: true }).run();
  });
  afterAll(() => vi.unstubAllGlobals());

  it("offers businesses whose reviews were never collected, not do-not-contact, and lets you refresh one by hand", () => {
    const { stats, placeIds } = rf.findReviewCandidates(nicheX, { rel: "all", sort: "score", dir: "desc", page: 1 }, 50);
    expect(stats).toMatchObject({ matching: 7, alreadyDone: 1, doNotContact: 1, eligible: 5 });
    expect(placeIds.sort()).toEqual(["A", "B", "C", "D", "E"]);
    // by hand, one that already has reviews can be refreshed (they go stale); do-not-contact cannot
    const r = rf.resolveReviewTargets(["DONE", "DNC", "A"]);
    expect(r.placeIds.sort()).toEqual(["A", "DONE"]);
    expect(r.skipped).toEqual([{ placeId: "DNC", reason: "marked do-not-contact" }]);
  });

  it("starts one run per country with only those place ids, newest reviews, and a cap sized to the batch", async () => {
    const started = await rf.startReviewFetch(["A", "B", "C", "D", "E"], 5);
    expect(started).toMatchObject({ count: 5, trimmed: false });
    expect(started.runIds).toHaveLength(2); // US and CA, since gl is the country
    expect(started.estimatedUsd).toBeCloseTo(estimateReviewFetchUsd(5, 5, "starter"), 6);

    const us = posts.find((p) => p.body.gl === "us")!;
    expect((us.body.placeIds as string[]).sort()).toEqual(["A", "B", "C", "D"]);
    expect(us.body).toMatchObject({ reviews: true, maxReviews: 5, reviewsSort: "newest", hl: "en" });
    expect(us.body).not.toHaveProperty("query");
    expect(us.body).not.toHaveProperty("polygon");
    expect(posts.find((p) => p.body.gl === "ca")!.body.placeIds).toEqual(["E"]);

    const cap = Number(new URL(us.url).searchParams.get("maxTotalChargeUsd"));
    expect(cap).toBeCloseTo(estimateReviewFetchUsd(4, 5, "starter") + 0.01, 6);
    expect(ed.placesInFlight().has("A")).toBe(true);
    expect(db.select().from(s.enrichmentRuns).all().every((r) => r.kind === "reviews")).toBe(true);
  });

  it("updates only the review data and rating on the places that came back with reviews", async () => {
    const run = db.select().from(s.enrichmentRuns).get()!;
    const { syncReviews } = rf;
    expect((await syncReviews(run.id))!.run.status).toBe("running");
    expect(place("A").reviewSample).toBeNull();

    remote = "SUCCEEDED";
    dataset = [
      { placeId: "A", title: "SHOULD NOT REPLACE THE TITLE", totalScore: 4.7, reviewsCount: 133, reviews: [rv("a1", 200), rv("a2", 230), rv("a3", 260)] },
      { placeId: "B", title: "Bee Floors", reviews: [] },
      { placeId: "C", title: "Cee Coatings" }, // no reviews field: leave alone
      { placeId: "NOT-REQUESTED", reviews: [rv("z", 1)] },
    ]; // D is missing from the results altogether
    const r = (await syncReviews(run.id))!;
    expect(r.run).toMatchObject({ status: "ingested", enrichedCount: 4, ownerCount: 2 }); // asked for 4, 2 were updated
    expect(r.run.costUsd).toBeCloseTo(0.0123, 6);

    const a = place("A");
    expect(a.reviewSample!.map((x) => x.id)).toEqual(["a1", "a2", "a3"]);
    expect(a.reviewsSampledAt).not.toBeNull();
    expect(a).toMatchObject({ reviewsCount: 133, totalScore: 4.7, title: "Acme Epoxy", website: "https://a.com" }); // fresh count and rating, nothing else
    expect(place("B").reviewSample).toEqual([]); // asked, and there are none
    expect(place("C").reviewSample).toBeNull();
    expect(place("D").reviewSample).toBeNull();
    expect(db.select().from(s.places).where(eq(s.places.placeId, "NOT-REQUESTED")).get()).toBeUndefined();
  });

  it("rescored every niche that tracks an updated place, not just one", () => {
    for (const niche of [nicheX, nicheY]) {
      const row = db.select().from(s.nichePlaces).where(eq(s.nichePlaces.placeId, "A")).all().find((r) => r.nicheId === niche)!;
      expect(row.offerScores!.review_system!.evidence.join(" ")).toContain("Newest review is 7 months old: new reviews have dried up");
    }
  });

  it("does nothing more on a repeat poll, and nothing for a place whose run is still in flight", async () => {
    const run = db.select().from(s.enrichmentRuns).get()!;
    const before = polls;
    await rf.syncReviews(run.id);
    expect(polls).toBe(before);
    expect(rf.resolveReviewTargets(["E"]).skipped).toEqual([{ placeId: "E", reason: "already being looked up" }]); // the CA run is still going
  });

  it("refuses to start with nothing to fetch", async () => {
    await expect(rf.startReviewFetch([])).rejects.toThrow("Nothing to fetch");
  });
});
