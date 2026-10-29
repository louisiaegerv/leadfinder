import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import {
  SEARCH_PER_BUSINESS_USD,
  buildOwnerMessage,
  buildQueries,
  estimateSearchCostUsd,
  searchCapUsd,
  snippetsFrom,
  verifyOwner,
  type Extraction,
  type SearchPlace,
} from "./owner-search";

const place = (over: Partial<SearchPlace> = {}): SearchPlace => ({
  title: "New Era Epoxy Flooring",
  city: "Spring",
  state: "TX",
  domain: "neweraepoxy.com",
  website: "https://neweraepoxy.com/",
  phone: "(832) 253-3211",
  ...over,
});

// Results copied (trimmed) from a real run of the search actor for "neweraepoxy.com owner".
const R = (position: number, url: string, title: string, description: string) => ({ position, url, title, description });
const REAL_RESULTS = [
  R(1, "https://www.linkedin.com/in/juan-gonzalez-a468b7254", "Juan Gonzalez - Founder @ New Era Epoxy Flooring - LinkedIn", "Juan Gonzalez is the founder of New Era Epoxy Floors, established in 2015. His company specializes in industrial-grade epoxy coatings, polished concrete, and ..."),
  R(2, "https://neweraepoxy.com/", "New Era Epoxy: Epoxy Flooring Houston | Metallic, Flake & Polished", "Juan Gonzalez, founder of New Era Epoxy Floors, I started New Era Epoxy in 2015 as a Houston industrial flooring contractor, Talk to Juan (832) 253-3211"),
  R(3, "https://www.instagram.com/neweraepoxy/?hl=en", "JuanG (EPOXY PLUG ) (@neweraepoxy) - Instagram", "Life of an Entrepreneur @neweraepoxy … durable epoxy masterpiece. New Era Epoxy delivers commercial coatings built to perform."),
  R(5, "https://www.facebook.com/juan.gonzalez.279601/", "Juan Gonzalez (@juan.gonzalez.279601) - Facebook", "Owner and CEO. Apr 17, 2021 - Present · 5 years, 6 months. New Era Epoxy ... neweraepoxy.com 832-253-3211 · Natalie Marie Kng and 15 others · 16."),
  R(6, "https://www.bbb.org/us/tx/spring/profile/epoxy-floor-coating/new-era-epoxy-flooring-llc-0915-90048546", "New Era Epoxy Flooring LLC | BBB Business Profile", "Business Management: Mr. Juan Gonzalez, Owner/Partner BBB Business Profiles are provided solely to assist you in exercising your own best judgment."),
  R(7, "https://www.neweraepoxy.ca/", "Epoxy Flooring Edmonton | New Era Epoxy", "New Era Epoxy installs epoxy and polyaspartic floor coatings for garages, shops, and commercial concrete across Edmonton and surrounding communities."),
  R(9, "https://xtremepolishingsystems.com/blogs/epoxy-journey", "From Epoxy Contractor to XPS Xpress Owner: Mike Brewer's Epoxy Journey", "Discover how Mike Brewer built a $700K+ epoxy business, expanded into STARDEK, and became an XPS Xpress owner."),
];
const ROW = (term: string, results = REAL_RESULTS) => ({ page_number: 1, search_term: term, results, next_page: 2 });

const juan: Extraction = {
  owner: {
    name: "Juan Gonzalez",
    title: "Founder",
    evidence: [
      { url: "https://www.linkedin.com/in/juan-gonzalez-a468b7254", quote: "Juan Gonzalez is the founder of New Era Epoxy Floors" },
      { url: "https://neweraepoxy.com/", quote: "Juan Gonzalez, founder of New Era Epoxy Floors" },
      { url: "https://www.bbb.org/us/tx/spring/profile/epoxy-floor-coating/new-era-epoxy-flooring-llc-0915-90048546", quote: "Mr. Juan Gonzalez, Owner/Partner" },
    ],
  },
  linkedin: "https://www.linkedin.com/in/juan-gonzalez-a468b7254",
};

describe("buildQueries", () => {
  it("searches the website address and the name plus place, two queries at most", () => {
    expect(buildQueries(place())).toEqual(["neweraepoxy.com owner", '"New Era Epoxy Flooring" Spring TX owner']);
  });

  it("uses only the name query when there is no website or only a social page", () => {
    expect(buildQueries(place({ website: null, domain: null }))).toEqual(['"New Era Epoxy Flooring" Spring TX owner']);
    expect(buildQueries(place({ website: "https://www.facebook.com/x", domain: "facebook.com" }))).toHaveLength(1);
  });

  it("copes with a missing place and stray quotes or whitespace in the name", () => {
    expect(buildQueries(place({ title: ' Joe\'s  "Best"\n Paint ', city: null, state: null, website: null, domain: null }))).toEqual(["\"Joe's Best Paint\" owner"]);
  });
});

describe("snippetsFrom", () => {
  const q = ["neweraepoxy.com owner"];

  it("reads the rows for these queries only, ignoring merged rows, bad urls and duplicates", () => {
    const rows = [
      ROW("neweraepoxy.com owner"),
      ROW("somebody else owner", [R(1, "https://other.com", "Other", "x")]),
      { page_number: "all", search_term: "neweraepoxy.com owner", results: [R(1, "https://merged.com", "Merged", "x")] },
      ROW("  NewEraEpoxy.com   OWNER ", [R(1, "https://neweraepoxy.com/", "dup", "dup"), R(2, "not a url", "bad", "bad"), R(3, "https://ok.com/a", "Ok", "d")]),
    ];
    const s = snippetsFrom(rows, q);
    expect(s.map((x) => x.url)).toContain("https://ok.com/a");
    expect(s.filter((x) => x.url === "https://neweraepoxy.com/")).toHaveLength(1);
    expect(s.some((x) => x.url === "https://other.com" || x.url === "https://merged.com" || x.url === "not a url")).toBe(false);
    expect(s[0]).toMatchObject({ url: "https://www.linkedin.com/in/juan-gonzalez-a468b7254", host: "linkedin.com" });
  });

  it("also accepts the README's field name 'query' and tolerates junk", () => {
    expect(snippetsFrom([{ query: "neweraepoxy.com owner", results: [R(1, "https://a.com", "A", "d")] }, { results: "nope" }, {}], q)).toHaveLength(1);
  });
});

describe("verifyOwner on the real New Era results", () => {
  const snippets = snippetsFrom([ROW("neweraepoxy.com owner")], ["neweraepoxy.com owner"]);

  it("accepts a founder backed by several independent sites, with the best confidence", () => {
    const f = verifyOwner(juan, snippets, place())!;
    expect(f).toMatchObject({ name: "Juan Gonzalez", title: "Founder", confidence: 0.9, ownDomain: true });
    expect(f.hostsCount).toBeGreaterThanOrEqual(4); // linkedin, the site, facebook, bbb
    expect(f.evidence).toHaveLength(3);
    expect(f.linkedin).toBe("https://www.linkedin.com/in/juan-gonzalez-a468b7254");
  });

  it("rejects a quote that is not actually in the cited result (a made-up source)", () => {
    const x: Extraction = { ...juan, owner: { ...juan.owner!, evidence: [{ url: "https://neweraepoxy.com/", quote: "Juan Gonzalez has run the company for twenty years" }] } };
    expect(verifyOwner(x, snippets, place())).toBeNull();
  });

  it("rejects evidence that cites a url that was not in the results, or one that does not name the person", () => {
    expect(verifyOwner({ ...juan, owner: { ...juan.owner!, evidence: [{ url: "https://invented.com/", quote: "Juan Gonzalez, founder" }] } }, snippets, place())).toBeNull();
    expect(verifyOwner({ ...juan, owner: { ...juan.owner!, evidence: [{ url: "https://www.neweraepoxy.ca/", quote: "New Era Epoxy installs epoxy and polyaspartic floor coatings" }] } }, snippets, place())).toBeNull();
  });

  it("rejects a title that isn't an owner role, a one-word name, and the business name itself", () => {
    expect(verifyOwner({ ...juan, owner: { ...juan.owner!, title: "Estimator" } }, snippets, place())).toBeNull();
    expect(verifyOwner({ ...juan, owner: { ...juan.owner!, name: "Juan" } }, snippets, place())).toBeNull();
    expect(verifyOwner({ ...juan, owner: { ...juan.owner!, name: "New Era Epoxy Flooring" } }, snippets, place())).toBeNull();
    expect(verifyOwner({ owner: null, linkedin: null }, snippets, place())).toBeNull();
  });

  it("scores one site as a guess and two independent sites as confirmed", () => {
    const one = snippets.filter((s) => s.host === "bbb.org");
    const x: Extraction = { owner: { name: "Juan Gonzalez", title: "Owner", evidence: [juan.owner!.evidence[2]] }, linkedin: null };
    expect(verifyOwner(x, one, place())!.confidence).toBe(0.5);
    const two = snippets.filter((s) => s.host === "bbb.org" || s.host === "linkedin.com");
    expect(verifyOwner(x, two, place({ domain: null, website: null }))!.confidence).toBe(0.8);
  });

  it("does not return a linkedin url that wasn't one of the results or isn't a profile", () => {
    expect(verifyOwner({ ...juan, linkedin: "https://www.linkedin.com/in/someone-else" }, snippets, place())!.linkedin).toBeNull();
    expect(verifyOwner({ ...juan, linkedin: "https://neweraepoxy.com/" }, snippets, place())!.linkedin).toBeNull();
  });

  it("puts the business and results in the model message as plain data", () => {
    const m = JSON.parse(buildOwnerMessage(place(), snippets));
    expect(m.business).toMatchObject({ name: "New Era Epoxy Flooring", city: "Spring" });
    expect(m.results[0]).toEqual({ url: snippets[0].url, title: snippets[0].title, description: snippets[0].description });
  });
});

describe("search cost", () => {
  it("is a fraction of a cent per business, and capped by queries", () => {
    expect(estimateSearchCostUsd(2, 1)).toBeCloseTo(0.0013, 5);
    expect(SEARCH_PER_BUSINESS_USD).toBeCloseTo(0.0013, 5);
    expect(searchCapUsd(100, 5)).toBeCloseTo(0.06, 5);
    expect(searchCapUsd(100000, 5)).toBe(5);
  });
});

// ---------- database + stubbed Apify and OpenRouter ----------

const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "lf-own-")), "t.db");
process.env.DATABASE_PATH = tmp;
process.env.APIFY_TOKEN = "test-token";
process.env.APIFY_API_BASE = "https://apify.test/v2";
process.env.OPENROUTER_API_KEY = "test-key";
process.env.OPENROUTER_API_BASE = "https://openrouter.test/api/v1";

describe("owner search flow", () => {
  let db: typeof import("@/db").db;
  let s: typeof import("@/db").schema;
  let o: typeof import("./owner-search-db");
  let e: typeof import("./enrich-db");
  let eq: typeof import("drizzle-orm").eq;
  let and: typeof import("drizzle-orm").and;
  let nicheId = 0;

  const calls: { method: string; url: string; body?: Record<string, unknown> }[] = [];
  let llmCalls = 0;
  let llmFails = false;
  let remoteStatus = "RUNNING";
  let datasetRows: unknown[] = [];

  const mk = (id: string, title: string, over: Record<string, unknown> = {}) => {
    db.insert(s.places).values({ placeId: id, title, categories: [], scrapedAt: new Date(), city: "Spring", state: "TX", countryCode: "US", ...over }).run();
    db.insert(s.nichePlaces).values({ nicheId, placeId: id, relevance: "target", score: 50 }).run();
  };

  beforeAll(async () => {
    vi.stubGlobal("fetch", async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
      calls.push({ method: init?.method ?? "GET", url, body });
      const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { "Content-Type": "application/json" } });
      if (url.includes("openrouter.test")) {
        llmCalls++;
        if (llmFails) return json({ error: "unauthorized" }, 401);
        const user = JSON.parse(String((body!.messages as { content: string }[])[1].content));
        const out = user.business.name === "New Era Epoxy Flooring" ? juan : { owner: null, linkedin: null };
        return json({ choices: [{ message: { content: JSON.stringify(out) } }], usage: { cost: 0.0003 } });
      }
      if (url.includes("/acts/scraperlink~google-search-results-serp-scraper/runs")) return json({ data: { id: "s1", status: "READY", defaultDatasetId: "ds-s1" } });
      if (url.includes("/acts/menus-r-us~business-profile-enricher/runs")) return json({ data: { id: "e1", status: "READY", defaultDatasetId: "ds-e1" } });
      if (url.includes("/actor-runs/s1")) return json({ data: { id: "s1", status: remoteStatus, defaultDatasetId: "ds-s1", usageTotalUsd: 0.0025 } });
      if (url.includes("/datasets/ds-s1/items")) return json(datasetRows);
      return new Response("not found", { status: 404 });
    });
    ({ db, schema: s } = await import("@/db"));
    o = await import("./owner-search-db");
    e = await import("./enrich-db");
    ({ eq, and } = await import("drizzle-orm"));
    const { emptyPlaybook } = await import("./playbook");
    nicheId = db.insert(s.niches).values({ name: "N", target: "", playbook: emptyPlaybook() }).returning().get().id;
  });
  afterAll(() => vi.unstubAllGlobals());

  it("starts a batched run with the right queries, country, page limit, timeout and spend cap", async () => {
    mk("A", "New Era Epoxy Flooring", { website: "https://neweraepoxy.com/", domain: "neweraepoxy.com", phone: "(832) 253-3211" });
    mk("B", "Plain Biz", { city: "Conroe" }); // no website
    mk("C", "Quiet Floors", { website: "https://quietfloors.com", domain: "quietfloors.com" });

    const started = await o.startOwnerSearch(["A", "B", "C"], { fallback: true });
    expect(started).toMatchObject({ count: 3, trimmed: false });
    expect(started.runIds).toHaveLength(1);

    const post = calls.find((c) => c.method === "POST" && c.url.includes("google-search-results"))!;
    expect(post.body).toEqual({
      keyword: ['neweraepoxy.com owner', '"New Era Epoxy Flooring" Spring TX owner', '"Plain Biz" Conroe TX owner', "quietfloors.com owner", '"Quiet Floors" Spring TX owner'].join("\n"),
      limit: "10",
      include_merged: false,
      country: "US",
      hl: "en",
    });
    expect(post.url).toMatch(/maxTotalChargeUsd=0\.0125/); // 5 searches x $0.0005 + a cent of slack
    expect(post.url).toMatch(/timeout=300/);
    expect(e.placesInFlight()).toEqual(new Set(["A", "B", "C"]));
  });

  it("waits while the search runs, then verifies owners, saves them, and reads the website only for the one not found", async () => {
    const run = db.select().from(s.enrichmentRuns).where(eq(s.enrichmentRuns.kind, "search")).get()!;
    expect((await o.syncSearch(run.id))!.run.status).toBe("running");
    expect(llmCalls).toBe(0);

    remoteStatus = "SUCCEEDED";
    datasetRows = [
      ROW("neweraepoxy.com owner"),
      ROW('"New Era Epoxy Flooring" Spring TX owner', REAL_RESULTS.slice(3, 5)),
      ROW('"Plain Biz" Conroe TX owner', [R(1, "https://plainbiz.example/", "Plain Biz", "A plain business in Conroe.")]),
      ROW("quietfloors.com owner", []),
      ROW('"Quiet Floors" Spring TX owner', []),
    ];
    const r = (await o.syncSearch(run.id))!;
    expect(r.run).toMatchObject({ status: "ingested", enrichedCount: 3, ownerCount: 1 });
    expect(r.run.costUsd).toBeCloseTo(0.0025 + 0.0003 * 2, 6); // search spend plus the two model calls
    expect(llmCalls).toBe(2); // A and B; C had nothing to read so the model was never asked

    const contactA = db.select().from(s.contacts).where(eq(s.contacts.placeId, "A")).get()!;
    expect(contactA).toMatchObject({ ownerName: "Juan Gonzalez", source: "search", confidence: 0.9 });
    expect(o.getOwnerSearch("A")!.record.finding!.evidence.length).toBe(3);
    expect(o.getOwnerSearch("B")!.record.finding).toBeNull();
    expect(db.select().from(s.contacts).where(eq(s.contacts.placeId, "B")).get()).toBeUndefined();

    // fallback: only C (has a website, no owner found); B has no website to read
    expect(r.fallbackStarted).toBe(1);
    const site = calls.find((c) => c.method === "POST" && c.url.includes("business-profile-enricher"))!;
    expect(site.body).toEqual({ mode: "urls", urls: ["https://quietfloors.com/"] });

    // polling again does nothing, and the model is not asked twice
    const before = calls.length;
    await o.syncSearch(run.id);
    expect(calls.length).toBe(before);
  });

  it("uses the cache instead of paying the model again for identical results", async () => {
    const run = db.select().from(s.enrichmentRuns).where(eq(s.enrichmentRuns.kind, "search")).get()!;
    const before = llmCalls;
    const again = await o.ingestSearchRun(run, datasetRows as Record<string, unknown>[]);
    expect(again.owners).toBe(1);
    expect(llmCalls).toBe(before);
    expect(again.llmCostUsd).toBe(0);
  });

  it("fails the run cleanly when the model can't be reached, saving nothing and not retrying forever", async () => {
    mk("D", "Dee Floors", { website: "https://deefloors.com", domain: "deefloors.com" });
    // The earlier fake run is still "in flight" until it is cleared, which is itself the behavior we want to see.
    db.update(s.enrichmentRuns).set({ status: "ingested" }).where(eq(s.enrichmentRuns.status, "running")).run();
    const started = await o.startOwnerSearch(["D"], { fallback: false });
    llmFails = true;
    datasetRows = [ROW("deefloors.com owner"), ROW('"Dee Floors" Spring TX owner', REAL_RESULTS.slice(0, 2))];
    const r = (await o.syncSearch(started.runIds[0]))!;
    expect(r.run.status).toBe("failed");
    expect(r.run.error).toContain("Reading the search results failed");
    expect(o.getOwnerSearch("D")).toBeNull(); // nothing recorded, so it stays a candidate
    expect(db.select().from(s.enrichmentRuns).where(eq(s.enrichmentRuns.id, started.runIds[0])).get()!.status).toBe("failed");
    llmFails = false;
  });

  it("only replaces a saved owner with an equal or stronger finding, and never a typed one", () => {
    mk("S1", "Strong Co");
    db.insert(s.contacts).values({ placeId: "S1", ownerName: "Strong Person", source: "enrichment", confidence: 0.9 }).run();
    expect(e.saveOwner(db, "S1", "Weak Guess", 0.5, "search")).toBe(false);
    expect(e.saveOwner(db, "S1", "Equal Person", 0.9, "search")).toBe(true);
    expect(db.select().from(s.contacts).where(eq(s.contacts.placeId, "S1")).get()!.ownerName).toBe("Equal Person");

    mk("S2", "Typed Co");
    db.insert(s.contacts).values({ placeId: "S2", ownerName: "Typed Name", source: "manual", confidence: 1 }).run();
    expect(e.saveOwner(db, "S2", "Anyone Else", 0.9, "search")).toBe(false);
  });

  it("picks search candidates: best first, skipping the searched, the confirmed, do-not-contact and in-flight", () => {
    mk("N1", "New One 1", { website: "https://n1.com", domain: "n1.com" });
    mk("N2", "New One 2");
    db.update(s.nichePlaces).set({ score: 99 }).where(and(eq(s.nichePlaces.placeId, "N1"), eq(s.nichePlaces.nicheId, nicheId))).run();
    mk("DNC", "No Calls");
    db.insert(s.contacts).values({ placeId: "DNC", doNotContact: true }).run();
    const { stats, placeIds } = o.findSearchCandidates(nicheId, { rel: "all", sort: "score", dir: "desc", page: 1 }, 2);
    expect(placeIds[0]).toBe("N1");
    expect(placeIds).toHaveLength(2);
    expect(stats.doNotContact).toBe(1);
    expect(stats.alreadyDone).toBeGreaterThanOrEqual(3); // A (confirmed), B and C (searched), S1/S2 (owners known)
    expect(stats.withWebsite).toBeGreaterThanOrEqual(1);
    expect(o.resolveSearchTargets(["N1", "DNC"]).skipped).toEqual([{ placeId: "DNC", reason: "marked do-not-contact" }]);
  });
});
