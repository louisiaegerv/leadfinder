import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { emptyPlaybook } from "./playbook";
import { SCORING_VERSION, scorePlace, type ScoreInput } from "./scoring";
import type { Fetched, Fetcher } from "./site-scan";
import type { SiteSignals } from "./site-types";

// ---------- scoring evidence (pure) ----------

const base: ScoreInput = {
  relevance: "target",
  areaId: 1,
  postalCode: "77380",
  categories: ["Flooring contractor"],
  domain: "acme.com",
  website: "https://acme.com",
  phone: "+17135550100",
  totalScore: 4.6,
  reviewsCount: 60,
  photosCount: 30,
  permanentlyClosed: false,
  temporarilyClosed: false,
  openingHours: null,
  bookingLinks: null,
  facebookState: null,
};
const sig = (over: Partial<SiteSignals> = {}): SiteSignals => ({
  outcome: "ok", https: true, viewport: true, hasForm: true, hasBooking: false, chat: null, fbPixel: false, analytics: true, builder: null, copyrightYear: new Date().getFullYear(), facebookUrl: null, ...over,
});
const evidence = (p: ScoreInput, offer: Parameters<typeof Object.keys>[0] extends never ? never : "website" | "speed_to_lead" | "facebook_ads") =>
  scorePlace(p, emptyPlaybook(), null).offers[offer].evidence.join(" | ");

describe("site signals in scoring", () => {
  it("changes nothing for a business that has not been scanned, or whose page could not be read", () => {
    const plain = scorePlace(base, emptyPlaybook(), null);
    expect(scorePlace({ ...base, site: null }, emptyPlaybook(), null)).toEqual(plain);
    for (const outcome of ["blank", "blocked", "error", "refused", "not_html"] as const)
      expect(scorePlace({ ...base, site: sig({ outcome, viewport: false, hasForm: false }) }, emptyPlaybook(), null)).toEqual(plain);
    expect(SCORING_VERSION).toBeGreaterThanOrEqual(3); // existing scores are recomputed once to include the new rules
  });

  it("website offer: a site that did not load, has no mobile tag, a stale footer, no form, or a DIY builder", () => {
    expect(evidence({ ...base, site: sig({ outcome: "dead" }) }, "website")).toContain("(inferred) The website did not load");
    const weak = evidence({ ...base, site: sig({ viewport: false, hasForm: false, copyrightYear: 2018, builder: "wix" }) }, "website");
    expect(weak).toContain("No mobile viewport tag");
    expect(weak).toContain("(inferred) Footer says © 2018");
    expect(weak).toContain("No quote or contact form");
    expect(weak).toContain("(inferred) Built on wix");
    const healthy = evidence({ ...base, site: sig() }, "website");
    expect(healthy).not.toMatch(/viewport|Footer says|No quote|Built on/);
  });

  it("speed to lead: no form or chat is a gap, and an existing chat widget counts against", () => {
    const withGap = scorePlace({ ...base, site: sig({ hasForm: false }) }, emptyPlaybook(), null).offers.speed_to_lead;
    const without = scorePlace(base, emptyPlaybook(), null).offers.speed_to_lead;
    expect(withGap.evidence.join(" ")).toContain("a visitor can only phone");
    expect(withGap.score).toBe(without.score + 10);
    const chatty = scorePlace({ ...base, site: sig({ chat: "Tidio" }) }, emptyPlaybook(), null).offers.speed_to_lead;
    expect(chatty.evidence.join(" ")).toContain("Already has a chat widget (Tidio)");
    expect(chatty.score).toBe(without.score - 5);
  });

  it("facebook ads: pixel is labelled an inference, and a linked page counts only until the page has been checked", () => {
    const e = evidence({ ...base, site: sig({ fbPixel: true, facebookUrl: "https://facebook.com/acme" }) }, "facebook_ads");
    expect(e).toContain("(inferred) Facebook Pixel on the site");
    expect(e).toContain("Has a Facebook page, so it is active on the platform");
    expect(evidence({ ...base, facebookState: "page_no_ads", site: sig({ facebookUrl: "https://facebook.com/acme" }) }, "facebook_ads")).not.toContain("so it is active on the platform");
  });

  it("facebook ads: a page found by search counts the same as one linked from the site, and only once", () => {
    const viaSearch = evidence({ ...base, facebookPageUrl: "https://www.facebook.com/acme" }, "facebook_ads");
    expect(viaSearch).toContain("Has a Facebook page, so it is active on the platform");
    const both = evidence({ ...base, facebookPageUrl: "https://www.facebook.com/acme", site: sig({ facebookUrl: "https://facebook.com/acme" }) }, "facebook_ads");
    expect(both.split("Has a Facebook page").length - 1).toBe(1);
    expect(evidence(base, "facebook_ads")).not.toContain("so it is active on the platform");
  });
});

// ---------- database flow ----------

const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "lf-scan-")), "t.db");
process.env.DATABASE_PATH = tmp;
process.env.APIFY_TOKEN = "test-token";
process.env.APIFY_API_BASE = "https://apify.test/v2";

const FILL = "We install epoxy and polished concrete floors for garages, shops and showrooms across Houston. ".repeat(8);
const html = (body: string, head = "", viewport = true) =>
  `<!doctype html><html><head><title>t</title>${viewport ? '<meta name="viewport" content="width=device-width">' : ""}${head}</head><body>${body}</body></html>`;
const ok = (h: string, url: string): Fetched => ({ status: 200, finalUrl: url, contentType: "text/html", html: h });

describe("scanning prospects", () => {
  let db: typeof import("@/db").db;
  let s: typeof import("@/db").schema;
  let sd: typeof import("./site-scan-db");
  let ed: typeof import("./enrich-db");
  let eq: typeof import("drizzle-orm").eq;
  let nicheId = 0;
  const apify: { url: string; body?: Record<string, unknown> }[] = [];

  const mk = (id: string, website: string | null, over: Record<string, unknown> = {}) => {
    db.insert(s.places).values({ placeId: id, title: `Biz ${id}`, categories: ["Flooring contractor"], scrapedAt: new Date(), website, domain: website ? new URL(website).hostname.replace(/^www\./, "") : null, phone: "+17135550100", reviewsCount: 40, totalScore: 4.5, ...over }).run();
    db.insert(s.nichePlaces).values({ nicheId, placeId: id, relevance: "target", score: 50 }).run();
  };

  const sites: Record<string, Fetched> = {
    "https://a.com/": ok(html(`<p>${FILL}</p><a href="https://www.facebook.com/AcmeA">f</a><a href="tel:7135550100">c</a>`, `<script type="application/ld+json">{"@type":"LocalBusiness","founder":{"@type":"Person","name":"Juan Gonzalez"}}</script>`), "https://a.com/"),
    "https://blank.com/": ok("<html><body><div id=root></div></body></html>", "https://blank.com/"),
    "https://dead.com/": { status: 0, finalUrl: "https://dead.com/", contentType: "", html: "", error: "ENOTFOUND" },
    "https://plain.com/": ok(html(`<p>${FILL}</p>`, "", false), "https://plain.com/"),
    "https://user-fb.com/": ok(html(`<p>${FILL}</p><a href="https://www.facebook.com/FromSite">f</a>`), "https://user-fb.com/"),
  };
  const fetcher: Fetcher = async (u) => sites[u] ?? { status: 404, finalUrl: u, contentType: "text/html", html: "" };

  beforeAll(async () => {
    vi.stubGlobal("fetch", async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      apify.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (url.includes("/runs?")) return new Response(JSON.stringify({ data: { id: "r1", status: "READY", defaultDatasetId: "ds1" } }), { status: 200 });
      return new Response("nope", { status: 404 });
    });
    ({ db, schema: s } = await import("@/db"));
    sd = await import("./site-scan-db");
    ed = await import("./enrich-db");
    ({ eq } = await import("drizzle-orm"));
    nicheId = db.insert(s.niches).values({ name: "N", target: "", playbook: emptyPlaybook() }).returning().get().id;
    mk("A", "https://a.com/");
    mk("BLANK", "https://blank.com/");
    mk("DEAD", "https://dead.com/");
    mk("PLAIN", "https://plain.com/");
    mk("USERFB", "https://user-fb.com/");
    mk("NOSITE", null);
    mk("SOCIAL", "https://www.facebook.com/x", { domain: "facebook.com" });
    db.insert(s.facebookProfiles).values({ placeId: "USERFB", pageUrl: "https://facebook.com/ChosenByUser", matchSource: "user", userOverride: true }).run();
  });
  afterAll(() => vi.unstubAllGlobals());

  it("picks candidates with a real website that haven't been scanned, and says why others are out", () => {
    db.insert(s.contacts).values({ placeId: "SOCIAL", doNotContact: true }).run();
    const { stats, placeIds } = sd.findScanCandidates(nicheId, { rel: "all", sort: "score", dir: "desc", page: 1 }, 3);
    expect(stats).toMatchObject({ matching: 7, eligible: 5, alreadyDone: 0, noWebsite: 1, doNotContact: 1 });
    expect(placeIds).toHaveLength(3);
    expect(sd.resolveScanTargets(["A", "NOSITE", "SOCIAL"])).toEqual({
      placeIds: ["A"],
      skipped: [{ placeId: "NOSITE", reason: "no business website to scan" }, { placeId: "SOCIAL", reason: "marked do-not-contact" }],
    });
  });

  it("scans sites, saves each result, and reports which need the paid second pass", async () => {
    const summary = await sd.scanPlaces(["A", "BLANK", "DEAD", "PLAIN", "USERFB"], { fetcher });
    expect(summary).toMatchObject({ scanned: 5, outcomes: { ok: 3, blank: 1, dead: 1 }, withSocials: 2, facebookFound: 1, ownersFound: 1 });
    expect(summary.needsBrowser).toEqual(["BLANK"]); // a dead domain isn't something a browser can fix

    const saved = sd.getSiteScan("A")!.scan;
    expect(saved).toMatchObject({ outcome: "ok", phones: ["7135550100"], socials: { facebook: "https://www.facebook.com/AcmeA" } });
    expect(sd.getSiteScan("DEAD")!.scan.outcome).toBe("dead");
  });

  it("fills the Facebook page link from the site, but never over one you chose", () => {
    expect(db.select().from(s.facebookProfiles).where(eq(s.facebookProfiles.placeId, "A")).get()).toMatchObject({
      pageUrl: "https://www.facebook.com/AcmeA", matchSource: "maps_website", matchConfidence: 0.8, state: null,
    });
    expect(db.select().from(s.facebookProfiles).where(eq(s.facebookProfiles.placeId, "USERFB")).get()).toMatchObject({
      pageUrl: "https://facebook.com/ChosenByUser", matchSource: "user", userOverride: true,
    });
  });

  it("records a founder named in structured data as the owner, at 0.8", () => {
    expect(db.select().from(s.contacts).where(eq(s.contacts.placeId, "A")).get()).toMatchObject({ ownerName: "Juan Gonzalez", source: "site", confidence: 0.8 });
  });

  it("refreshes scores with what the scan found, and leaves unscanned businesses alone", () => {
    const row = (id: string) => db.select().from(s.nichePlaces).where(eq(s.nichePlaces.placeId, id)).get()!;
    expect(row("DEAD").offerScores!.website!.evidence.join(" ")).toContain("did not load");
    expect(row("PLAIN").offerScores!.website!.evidence.join(" ")).toContain("No mobile viewport tag");
    expect(row("NOSITE").offerScores!.website!.evidence.join(" ")).not.toContain("viewport");
  });

  it("merges what the quick scan and the paid reader each found", () => {
    db.insert(s.enrichment)
      .values({ placeId: "A", kind: "profile", source: "actor", data: { url: null, people: [], emails: ["boss@a.com"], phones: ["(713) 555-0100", "832-555-0111"], socials: { instagram: "https://instagram.com/a" }, description: null, services: null, serviceArea: null, yearEstablished: null, confidence: null, fieldsFound: null }, fetchedAt: new Date() })
      .run();
    const info = sd.getContactInfo("A");
    expect(info.emails).toEqual(["boss@a.com"]);
    expect(info.phones).toEqual(["(713) 555-0100", "832-555-0111"]); // the same number written two ways counts once, formatted one kept
    expect(info.socials).toEqual({ instagram: "https://instagram.com/a", facebook: "https://www.facebook.com/AcmeA" });
  });

  it("sends only the unreadable sites to the paid reader, and skips ones it has already read", async () => {
    const run = await sd.startPaidSecondPass(["BLANK", "A"]); // A already has a paid read
    expect(run).toMatchObject({ count: 1 });
    const post = apify.find((c) => c.url.includes("business-profile-enricher"))!;
    expect(post.body).toEqual({ mode: "urls", urls: ["https://blank.com/"] });
    expect(ed.placesInFlight().has("BLANK")).toBe(true);
    expect(await sd.startPaidSecondPass(["A"])).toBeNull();
  });

  it("scanning again updates the saved result, and a scan that throws does not stop the others", async () => {
    sites["https://plain.com/"] = ok(html(`<p>${FILL}</p><a href="mailto:hi@plain.com">m</a>`), "https://plain.com/");
    const boom: Fetcher = async (u) => {
      if (u === "https://blank.com/") throw new Error("unexpected");
      return fetcher(u);
    };
    const r = await sd.scanPlaces(["PLAIN", "BLANK"], { fetcher: boom });
    expect(r.scanned).toBe(1);
    expect(sd.getSiteScan("PLAIN")!.scan).toMatchObject({ emails: ["hi@plain.com"], signals: { viewport: true } });
  });

  describe("after a Maps run finishes", () => {
    let runId = 0;
    const ids = ["AUTO1", "AUTO2", "AUTO3", "AUTO4", "AUTO5"];

    beforeAll(() => {
      sites["https://auto1.com/"] = ok(html(`<p>${FILL}</p><a href="https://www.facebook.com/Auto1">f</a>`), "https://auto1.com/");
      sites["https://auto2.com/"] = ok("<html><body><div id=root></div></body></html>", "https://auto2.com/");
      sites["https://auto4.com/"] = ok(html(`<p>${FILL}</p>`), "https://auto4.com/");
      mk("AUTO1", "https://auto1.com/");
      mk("AUTO2", "https://auto2.com/");
      mk("AUTO3", null); // no website
      mk("AUTO4", "https://auto4.com/"); // scanned already, by hand
      mk("AUTO5", "https://auto5.com/"); // do-not-contact
      db.insert(s.contacts).values({ placeId: "AUTO5", doNotContact: true }).run();
      const area = db.insert(s.areas).values({ nicheId, name: "Auto area", shape: "radius", centerLat: 30, centerLng: -95, radiusKm: 10, queries: ["q"] }).returning().get();
      runId = db.insert(s.runs).values({ areaId: area.id, inputs: {}, status: "ingested" }).returning().get().id;
      for (const id of ids) db.insert(s.placeRuns).values({ placeId: id, runId, query: "q" }).run();
    });

    it("picks only this run's places that have a real website, are unscanned, and are not do-not-contact", async () => {
      await sd.scanPlaces(["AUTO4"], { fetcher }); // already scanned
      expect(sd.unscannedInRun(runId).sort()).toEqual(["AUTO1", "AUTO2"]);
      expect(sd.unscannedInRun(999999)).toEqual([]);
    });

    it("does nothing when switched off", () => {
      process.env.AUTO_SCAN_ON_INGEST = "0";
      expect(sd.startAutoScan(runId, { fetcher })).toBeNull();
      expect(sd.getAutoScan(runId)).toBeNull();
      delete process.env.AUTO_SCAN_ON_INGEST;
    });

    it("scans in the background, reports progress and a summary, never starts twice, and never touches the paid reader", async () => {
      const before = apify.length;
      const task = sd.startAutoScan(runId, { fetcher });
      expect(task).not.toBeNull();
      expect(sd.startAutoScan(runId, { fetcher })).toBeNull(); // already running
      expect(sd.getAutoScan(runId)).toEqual({ state: "scanning", total: 2, done: 0 });
      await task;

      expect(sd.getAutoScan(runId)).toEqual({ state: "done", total: 2, scanned: 2, read: 1, needsBrowser: 1, unreachable: 0, facebookFound: 1, ownersFound: 0 });
      expect(sd.getSiteScan("AUTO1")!.scan.outcome).toBe("ok");
      expect(sd.getSiteScan("AUTO2")!.scan.outcome).toBe("blank"); // flagged, but left for you to send
      expect(apify.length).toBe(before); // nothing was sent to Apify
      expect(db.select().from(s.facebookProfiles).where(eq(s.facebookProfiles.placeId, "AUTO1")).get()?.pageUrl).toBe("https://www.facebook.com/Auto1");

      // everything is scanned now, so a repeat finds nothing to do
      expect(sd.startAutoScan(runId, { fetcher })).toBeNull();
    });

    it("shows a scan that was cut off by a restart as interrupted, not as running forever", () => {
      db.insert(s.settings).values({ key: "autoscan:424242", value: { state: "scanning", total: 10, done: 4 } }).run();
      expect(sd.getAutoScan(424242)).toEqual({ state: "interrupted", total: 10, done: 4 });
    });
  });
});
