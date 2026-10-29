import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { emptyPlaybook } from "./playbook";

const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "lf-fb-")), "t.db");
process.env.DATABASE_PATH = tmp;
process.env.APIFY_TOKEN = "test-token";
process.env.APIFY_API_BASE = "https://apify.test/v2";

const R = (url: string, title: string, description = "") => ({ position: 1, url, title, description });
const ROW = (term: string, results: ReturnType<typeof R>[]) => ({ page_number: 1, search_term: term, results, next_page: 2 });

describe("finding Facebook pages", () => {
  let db: typeof import("@/db").db;
  let s: typeof import("@/db").schema;
  let fb: typeof import("./facebook-search-db");
  let ed: typeof import("./enrich-db");
  let eq: typeof import("drizzle-orm").eq;
  let nicheId = 0;
  const calls: { method: string; url: string; body?: Record<string, unknown> }[] = [];
  let remote = "RUNNING";
  let dataset: unknown[] = [];

  const mk = (id: string, title: string, over: Record<string, unknown> = {}) => {
    db.insert(s.places).values({ placeId: id, title, categories: ["Flooring contractor"], scrapedAt: new Date(), city: "Spring", state: "Texas", countryCode: "US", phone: "+18322533211", reviewsCount: 120, totalScore: 4.6, website: `https://${id.toLowerCase()}.com`, domain: `${id.toLowerCase()}.com`, ...over }).run();
    db.insert(s.nichePlaces).values({ nicheId, placeId: id, relevance: "target", score: 50 }).run();
  };
  const profile = (id: string) => db.select().from(s.facebookProfiles).where(eq(s.facebookProfiles.placeId, id)).get();

  beforeAll(async () => {
    vi.stubGlobal("fetch", async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ method: init?.method ?? "GET", url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const json = (v: unknown) => new Response(JSON.stringify(v), { status: 200, headers: { "Content-Type": "application/json" } });
      if (url.includes("/acts/scraperlink~google-search-results-serp-scraper/runs")) return json({ data: { id: "f1", status: "READY", defaultDatasetId: "ds-f1" } });
      if (url.includes("/actor-runs/f1")) return json({ data: { id: "f1", status: remote, defaultDatasetId: "ds-f1", usageTotalUsd: 0.003 } });
      if (url.includes("/datasets/ds-f1/items")) return json(dataset);
      return new Response("nope", { status: 404 });
    });
    ({ db, schema: s } = await import("@/db"));
    fb = await import("./facebook-search-db");
    ed = await import("./enrich-db");
    ({ eq } = await import("drizzle-orm"));
    nicheId = db.insert(s.niches).values({ name: "N", target: "", playbook: emptyPlaybook() }).returning().get().id;
    mk("CLEAR", "New Era Epoxy Flooring Houston"); // search will find its page, with a page id in the url
    mk("NEAR", "Houston Concrete Staining"); // search finds only a different business
    mk("NONE", "Quiet Floors"); // nothing on Facebook in the results
    mk("SITE", "Acme Coatings"); // already linked from its own website, without a page id
    mk("USER", "Dee Epoxy"); // the user chose the page
    mk("OTHER", "Pat Polishing"); // site links one page; search finds a different one
    db.insert(s.facebookProfiles).values({ placeId: "SITE", pageUrl: "https://www.facebook.com/p/Acme-Coatings-100011112222333", matchSource: "maps_website", matchConfidence: 0.8, userOverride: false }).run();
    db.insert(s.facebookProfiles).values({ placeId: "USER", pageUrl: "https://www.facebook.com/ChosenByHand", matchSource: "user", userOverride: true }).run();
    db.insert(s.facebookProfiles).values({ placeId: "OTHER", pageUrl: "https://www.facebook.com/PatPolishingOfficial", matchSource: "maps_website", matchConfidence: 0.8, userOverride: false }).run();
  });
  afterAll(() => vi.unstubAllGlobals());

  it("offers businesses with no page yet, not searched, not do-not-contact, and says why the rest are out", () => {
    mk("DNC", "No Calls Floors");
    db.insert(s.contacts).values({ placeId: "DNC", doNotContact: true }).run();
    const { stats, placeIds } = fb.findFacebookCandidates(nicheId, { rel: "all", sort: "score", dir: "desc", page: 1 }, 10);
    expect(stats).toMatchObject({ matching: 7, doNotContact: 1, alreadyDone: 3 }); // SITE, USER, OTHER already have a page
    expect(placeIds.sort()).toEqual(["CLEAR", "NEAR", "NONE"]);
    expect(fb.resolveFacebookTargets(["CLEAR", "DNC"]).skipped).toEqual([{ placeId: "DNC", reason: "marked do-not-contact" }]);
    // one that already has a page (from its website, or one you chose) is not searched for, even by hand
    const withPage = fb.resolveFacebookTargets(["SITE", "USER", "CLEAR"]);
    expect(withPage.placeIds).toEqual(["CLEAR"]);
    expect(withPage.skipped.map((x) => x.reason)).toEqual(["already has a Facebook page", "already has a Facebook page"]);
  });

  it("starts one search per business, 'name city state Facebook', priced as plain searches", async () => {
    const started = await fb.startFacebookSearch(["CLEAR", "NEAR", "NONE", "SITE", "OTHER"]);
    expect(started.count).toBe(5);
    expect(started.estimatedUsd).toBeCloseTo(5 * 0.0005, 6); // no model cost
    const post = calls.find((c) => c.method === "POST" && c.url.includes("google-search"))!;
    const { keyword, ...rest } = post.body as { keyword: string };
    // one line per business; the order is whatever the database returns them in
    expect(keyword.split("\n").sort()).toEqual(
      [
        "New Era Epoxy Flooring Houston Spring Texas Facebook",
        "Houston Concrete Staining Spring Texas Facebook",
        "Quiet Floors Spring Texas Facebook",
        "Acme Coatings Spring Texas Facebook",
        "Pat Polishing Spring Texas Facebook",
      ].sort(),
    );
    expect(rest).toEqual({
      limit: "10",
      include_merged: false,
      country: "US",
      hl: "en",
    });
    expect(post.url).toMatch(/maxTotalChargeUsd=0\.0125/);
    const run = db.select().from(s.enrichmentRuns).get()!;
    expect(run.kind).toBe("facebook");
    expect(ed.placesInFlight().has("CLEAR")).toBe(true);
  });

  it("saves a clear match with its page id, records near misses as possibilities only, and keeps stronger sources", async () => {
    const run = db.select().from(s.enrichmentRuns).get()!;
    expect((await fb.syncFacebook(run.id))!.run.status).toBe("running");

    remote = "SUCCEEDED";
    dataset = [
      ROW("New Era Epoxy Flooring Houston Spring Texas Facebook", [
        R("https://www.yelp.com/biz/new-era", "New Era Epoxy - Yelp"),
        R("https://www.facebook.com/p/New-Era-Epoxy-Flooring-Houston-100063498765432/", "New Era Epoxy Flooring Houston | Spring TX | Facebook", "Spring, Texas. Call 832-253-3211"),
      ]),
      ROW("Houston Concrete Staining Spring Texas Facebook", [R("https://www.facebook.com/HoustonStainedGlass", "Houston Stained Glass", "Art glass in Houston")]),
      ROW("Quiet Floors Spring Texas Facebook", [R("https://www.yelp.com/biz/quiet", "Quiet Floors - Yelp")]),
      ROW("Acme Coatings Spring Texas Facebook", [R("https://www.facebook.com/p/Acme-Coatings-100011112222333/reviews", "Acme Coatings reviews", "Spring, Texas")]),
      ROW("Pat Polishing Spring Texas Facebook", [R("https://www.facebook.com/PatPolishingSpring", "Pat Polishing | Spring TX", "Spring, Texas")]),
    ];
    const r = (await fb.syncFacebook(run.id))!;
    expect(r.run).toMatchObject({ status: "ingested", enrichedCount: 5, ownerCount: 3 }); // CLEAR, SITE, OTHER matched something
    expect(r.run.costUsd).toBeCloseTo(0.003, 6); // search spend only

    expect(fb.resolveFacebookTargets(["CLEAR"]).skipped).toEqual([{ placeId: "CLEAR", reason: "already has a Facebook page" }]); // found by search: no second search
    expect(profile("CLEAR")).toMatchObject({
      pageUrl: "https://www.facebook.com/p/New-Era-Epoxy-Flooring-Houston-100063498765432",
      pageId: "100063498765432",
      matchSource: "search",
      state: null, // whether it runs ads is not decided by finding the page
    });
    expect(profile("CLEAR")!.matchConfidence).toBeGreaterThanOrEqual(0.8);

    expect(profile("NEAR")).toBeUndefined(); // a different business: nothing saved
    expect(fb.getFacebookSearch("NEAR")!.record.best).toBeNull();
    expect(fb.getFacebookSearch("NONE")!.record).toMatchObject({ best: null, candidates: [], snippetCount: 1 });

    // linked from the site: stays the site's, and now also knows the page id
    expect(profile("SITE")).toMatchObject({ matchSource: "maps_website", pageUrl: "https://www.facebook.com/p/Acme-Coatings-100011112222333", pageId: "100011112222333" });
    // you chose it: untouched, and a different page on the site wins over a search result
    expect(profile("USER")).toMatchObject({ pageUrl: "https://www.facebook.com/ChosenByHand", matchSource: "user" });
    expect(profile("OTHER")).toMatchObject({ pageUrl: "https://www.facebook.com/PatPolishingOfficial", matchSource: "maps_website" });
    expect(fb.getFacebookSearch("OTHER")!.record.best!.url).toBe("https://www.facebook.com/PatPolishingSpring"); // still shown as what search saw
  });

  it("uses no model, and a repeat poll does nothing more", async () => {
    expect(calls.some((c) => c.url.includes("openrouter"))).toBe(false);
    const before = calls.length;
    await fb.syncFacebook(db.select().from(s.enrichmentRuns).get()!.id);
    expect(calls.length).toBe(before);
    expect(ed.placesInFlight().size).toBe(0);
  });

  it("a page found counts toward the Facebook-ads fit once scores are refreshed", async () => {
    const { rescoreNiche } = await import("./rescore");
    rescoreNiche(nicheId);
    const evidence = (id: string) => db.select().from(s.nichePlaces).where(eq(s.nichePlaces.placeId, id)).get()!.offerScores!.facebook_ads!.evidence.join(" | ");
    expect(evidence("CLEAR")).toContain("Has a Facebook page, so it is active on the platform");
    expect(evidence("NONE")).not.toContain("Has a Facebook page, so");
  });

  it("searching again for one hand-picked business replaces its saved result", async () => {
    remote = "SUCCEEDED";
    dataset = [ROW("Quiet Floors Spring Texas Facebook", [R("https://www.facebook.com/QuietFloorsTX", "Quiet Floors | Spring, Texas | Facebook", "Spring, Texas")])];
    expect(fb.resolveFacebookTargets(["NONE"]).placeIds).toEqual(["NONE"]); // allowed even though searched before
    const again = await fb.startFacebookSearch(["NONE"]);
    // the stub hands back the same run id, so point the new row's remote at it and sync
    const row = db.select().from(s.enrichmentRuns).where(eq(s.enrichmentRuns.id, again.runIds[0])).get()!;
    expect(row.kind).toBe("facebook");
    await fb.syncFacebook(row.id);
    expect(profile("NONE")).toMatchObject({ pageUrl: "https://www.facebook.com/QuietFloorsTX", matchSource: "search" });
    expect(fb.getFacebookSearch("NONE")!.record.best!.url).toBe("https://www.facebook.com/QuietFloorsTX");
  });
});
