import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import {
  ENRICH_PRICE_USD,
  OWNERISH,
  enrichCapUsd,
  enrichableUrl,
  estimateEnrichCostUsd,
  hostOf,
  matchTargets,
  maxBusinessesForCap,
  parseItem,
  pickOwner,
} from "./enrich";

describe("enrichableUrl", () => {
  it("uses the business's own site and rejects social or directory pages and missing sites", () => {
    expect(enrichableUrl({ website: "https://www.acmeconcrete.com/", domain: "acmeconcrete.com" })).toBe("https://www.acmeconcrete.com/");
    expect(enrichableUrl({ website: null, domain: "acmeconcrete.com" })).toBe("https://acmeconcrete.com/");
    // Maps often stores a deep landing page with tracking parameters; the owner is on the front page's About/Team links
    expect(enrichableUrl({ website: "https://mygaragefloors.com/service-area/garage-floor-coating/?utm_source=google&utm_medium=organic", domain: "mygaragefloors.com" })).toBe("https://mygaragefloors.com/");
    expect(enrichableUrl({ website: "https://www.facebook.com/acme", domain: "facebook.com" })).toBeNull();
    expect(enrichableUrl({ website: "https://www.yelp.com/biz/acme", domain: "yelp.com" })).toBeNull();
    expect(enrichableUrl({ website: null, domain: null })).toBeNull();
  });
});

describe("hostOf / matchTargets", () => {
  it("ignores scheme, www, path and case", () => {
    expect(hostOf("HTTPS://www.Acme.com/about?x=1")).toBe("acme.com");
    expect(hostOf("acme.com")).toBe("acme.com");
    expect(hostOf("not a url ::")).toBeNull();
  });

  it("matches a result row to every target on that host, and to none when the url is missing", () => {
    const targets = [
      { placeId: "a", url: "https://acme.com" },
      { placeId: "b", url: "https://www.acme.com/" },
      { placeId: "c", url: "https://other.com" },
    ];
    expect(matchTargets({ url: "http://www.acme.com/contact" }, targets).map((t) => t.placeId)).toEqual(["a", "b"]);
    expect(matchTargets({}, targets)).toEqual([]);
  });
});

describe("parseItem", () => {
  it("reads the actor's flat row: comma-separated strings, people, socials, text confidence", () => {
    const p = parseItem({
      url: "https://acme.com",
      emails: "info@acme.com, Sales@Acme.com ,info@acme.com",
      phones: "(713) 555-0100, 713-555-0101",
      facebook: "https://facebook.com/acme",
      instagram: "",
      people: [{ name: "Jane Doe", title: "Owner", linked_email: null }, { name: "  ", title: "x" }, "junk"],
      confidence: "high",
      fieldsFound: 7,
      yearEstablished: 1998,
    });
    expect(p.emails).toEqual(["info@acme.com", "Sales@Acme.com"]);
    expect(p.phones).toEqual(["(713) 555-0100", "713-555-0101"]);
    expect(p.socials).toEqual({ facebook: "https://facebook.com/acme" });
    expect(p.people).toEqual([{ name: "Jane Doe", title: "Owner", email: null }]);
    expect(p.confidence).toBe(0.9);
    expect(p.yearEstablished).toBe(1998);
  });

  it("tolerates a nearly empty row and unexpected types without throwing", () => {
    const p = parseItem({ people: "nope", emails: 5, confidence: {}, yearEstablished: "n/a" });
    expect(p).toMatchObject({ people: [], emails: [], phones: [], socials: {}, confidence: null, yearEstablished: null });
  });
});

// Rows copied (trimmed) from a real run of the actor on three live sites.
const REAL_ROWS = [
  { success: true, url: "https://texanepoxycompany.com/", emails: "support@texanepoxycompany.com", phones: "936-249-6985", facebook: null, instagram: null, linkedin: null,
    people: [{ name: "Ben", title: "Owner", linked_email: null }, { name: "Ruby", title: "Owner", linked_email: null }],
    services: "Epoxy flake floors for garages, Metallic epoxy floors", yearEstablished: null, serviceArea: "Conroe, The Woodlands, Spring", fieldsFound: 8, confidence: "medium", error: null },
  { success: true, url: "http://daveshomeimprovements.com/", emails: null, phones: "832-450-8747", facebook: null,
    people: [{ name: "Dave Freeman", title: "Owner", linked_email: null }], yearEstablished: 1993, fieldsFound: 10, confidence: "medium", error: null },
  { success: true, url: "https://cypresssouthernhomes.com/", emails: "admin@cypresssouthernhomes.com, brent@cypresssouthernhomes.com", phones: "(360) 348-5801",
    facebook: "https://www.facebook.com/share/1KnrkMW4nS/?mibextid=wwXIfr", linkedin: "https://www.linkedin.com/in/brent-frisch-9b347933/",
    people: [{ name: "Brent Frisch", title: "Owner/ Builder", linked_email: "Brent@cypresssouthernhomes.com" }, { name: "Tifani Frisch", title: "Co-Owner / Operations & Client Relations", linked_email: "admin@cypresssouthernhomes.com" }],
    yearEstablished: 1998, fieldsFound: 12, confidence: "high", error: null },
];

describe("real actor output", () => {
  it("reads the three captured rows: owners, emails, null socials, linked emails", () => {
    const [texan, dave, cypress] = REAL_ROWS.map(parseItem);
    expect(pickOwner(texan.people)).toEqual({ name: "Ben", title: "Owner", certain: true }); // two co-owners: the first is used
    expect(texan.emails).toEqual(["support@texanepoxycompany.com"]);
    expect(texan.socials).toEqual({});
    expect(pickOwner(dave.people)).toEqual({ name: "Dave Freeman", title: "Owner", certain: true });
    expect(dave.emails).toEqual([]);
    expect(dave.yearEstablished).toBe(1993);
    expect(pickOwner(cypress.people)).toMatchObject({ name: "Brent Frisch", certain: true }); // "Owner/ Builder"
    expect(cypress.emails).toEqual(["admin@cypresssouthernhomes.com", "brent@cypresssouthernhomes.com"]);
    expect(cypress.people[0].email).toBe("Brent@cypresssouthernhomes.com");
    expect(cypress.socials.linkedin).toContain("brent-frisch");
    expect(cypress.confidence).toBe(0.9);
  });

  it("matches rows whose url is http or has a trailing slash back to the website we sent", () => {
    const targets = [{ placeId: "dave", url: "https://www.daveshomeimprovements.com" }];
    expect(matchTargets(REAL_ROWS[1], targets)).toEqual(targets);
  });
});

describe("owner titles", () => {
  it("recognises owners and founders, and not vice presidents or equipment operators", () => {
    for (const t of ["Owner", "Co-Owner / Operations & Client Relations", "Owner/ Builder", "Founder", "Co-Founder", "President", "CEO", "Chief Executive Officer", "Proprietor", "Managing Partner", "Owner Operator"])
      expect(OWNERISH.test(t), t).toBe(true);
    for (const t of ["Vice President", "Vice-President of Sales", "Assistant President", "Equipment Operator", "Estimator", "Crew Lead", "Operations Manager"])
      expect(OWNERISH.test(t), t).toBe(false);
  });
});

describe("pickOwner", () => {
  const person = (name: string, title: string | null = null) => ({ name, title, email: null });

  it("prefers a person whose title says owner or founder", () => {
    expect(pickOwner([person("Sam", "Estimator"), person("Jane", "Owner & Founder")])).toEqual({ name: "Jane", title: "Owner & Founder", certain: true });
    expect(pickOwner([person("Al", "President")])?.certain).toBe(true);
  });

  it("uses a lone listed person but flags it as a guess", () => {
    expect(pickOwner([person("Bob")])).toEqual({ name: "Bob", title: null, certain: false });
  });

  it("does not guess among several people with no clear owner", () => {
    expect(pickOwner([person("A", "Estimator"), person("B", "Crew lead")])).toBeNull();
    expect(pickOwner([])).toBeNull();
  });
});

describe("cost", () => {
  it("estimates $0.015 per business plus the start fee, and fits a cap", () => {
    expect(estimateEnrichCostUsd(0)).toBe(0);
    expect(estimateEnrichCostUsd(100)).toBeCloseTo(1.5002, 4);
    expect(enrichCapUsd(100, 5)).toBeCloseTo(1.5102, 4);
    expect(enrichCapUsd(1000, 5)).toBe(5);
    const fit = maxBusinessesForCap(5);
    expect(enrichCapUsd(fit, 5)).toBeLessThanOrEqual(5);
    expect(enrichCapUsd(fit + 1, 5)).toBe(5); // one more would be clamped, so it would not fit
    expect(ENRICH_PRICE_USD).toBe(0.015);
  });
});

// ---------- database + stubbed Apify ----------

const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "lf-enr-")), "t.db");
process.env.DATABASE_PATH = tmp;
process.env.APIFY_TOKEN = "test-token";
process.env.APIFY_API_BASE = "https://apify.test/v2";

describe("enrichment flow", () => {
  let db: typeof import("@/db").db;
  let s: typeof import("@/db").schema;
  let e: typeof import("./enrich-db");
  let eq: typeof import("drizzle-orm").eq;
  let nicheId = 0;
  const calls: { method: string; url: string; body?: unknown }[] = [];
  let remoteStatus = "RUNNING";
  let items: Record<string, unknown>[] = [];

  const place = (id: string, website: string | null, extra: Record<string, unknown> = {}) => {
    db.insert(s.places).values({ placeId: id, title: `Biz ${id}`, categories: [], scrapedAt: new Date(), website, domain: website ? hostOf(website) : null, ...extra }).run();
    db.insert(s.nichePlaces).values({ nicheId, placeId: id, relevance: "target", score: 50 }).run();
  };

  beforeAll(async () => {
    vi.stubGlobal("fetch", async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ method: init?.method ?? "GET", url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const json = (v: unknown) => new Response(JSON.stringify(v), { status: 200, headers: { "Content-Type": "application/json" } });
      if (url.includes("/runs?")) return json({ data: { id: "run1", status: "READY", defaultDatasetId: "ds1" } });
      if (url.includes("/actor-runs/")) return json({ data: { id: "run1", status: remoteStatus, defaultDatasetId: "ds1", usageTotalUsd: 0.0452, finishedAt: new Date().toISOString() } });
      if (url.includes("/datasets/ds1/items")) return json(items);
      return new Response("not found", { status: 404 });
    });
    ({ db, schema: s } = await import("@/db"));
    e = await import("./enrich-db");
    ({ eq } = await import("drizzle-orm"));
    const { emptyPlaybook } = await import("./playbook");
    nicheId = db.insert(s.niches).values({ name: "N", target: "", playbook: emptyPlaybook() }).returning().get().id;
  });
  afterAll(() => vi.unstubAllGlobals());

  it("resolves hand-picked businesses and says why one was skipped", () => {
    place("ok1", "https://acme.com");
    place("nosite", null);
    place("social", "https://www.facebook.com/x");
    place("dnc", "https://dnc.com");
    db.insert(s.contacts).values({ placeId: "dnc", doNotContact: true }).run();
    const r = e.resolveTargets(["ok1", "nosite", "social", "dnc"]);
    expect(r.targets).toEqual([{ placeId: "ok1", url: "https://acme.com/" }]);
    expect(Object.fromEntries(r.skipped.map((x) => [x.placeId, x.reason]))).toEqual({
      nosite: "no business website to read",
      social: "no business website to read",
      dnc: "marked do-not-contact",
    });
  });

  it("starts a run with the right input and spend cap, then waits until it finishes", async () => {
    place("run-a", "https://owner-site.com");
    place("run-b", "https://nobody-site.com");
    place("run-c", "https://failed-site.com");
    const r = e.resolveTargets(["run-a", "run-b", "run-c"]);
    const started = await e.startEnrichment(r.targets);
    expect(started).toMatchObject({ count: 3, trimmed: false });
    expect(started.estimatedUsd).toBeCloseTo(0.0452, 4);

    const post = calls.find((c) => c.method === "POST")!;
    expect(post.url).toContain("/acts/menus-r-us~business-profile-enricher/runs");
    expect(post.url).toMatch(/maxTotalChargeUsd=0\.0552/);
    expect(post.body).toEqual({ mode: "urls", urls: ["https://owner-site.com/", "https://nobody-site.com/", "https://failed-site.com/"] });

    // still running: nothing is written yet, and the places are held so they can't be sent twice
    expect((await e.syncEnrichment(started.runId))!.status).toBe("running");
    expect(e.getEnrichment("run-a")).toBeNull();
    expect(e.placesInFlight().has("run-a")).toBe(true);
    expect(e.resolveTargets(["run-a"]).skipped[0].reason).toBe("already being enriched");

    remoteStatus = "SUCCEEDED";
    items = [
      { url: "https://www.owner-site.com/", emails: "hi@owner-site.com", people: [{ name: "Jane Doe", title: "Owner", linked_email: null }], confidence: "high", fieldsFound: 6 },
      { url: "https://nobody-site.com", people: [{ name: "A", title: "Estimator" }, { name: "B", title: "Crew" }], emails: "x@nobody-site.com" },
      // failed-site.com returned nothing (failed URLs are not charged and have no row)
    ];
    const done = (await e.syncEnrichment(started.runId))!;
    expect(done).toMatchObject({ status: "ingested", enrichedCount: 2, ownerCount: 1, costUsd: 0.0452 });

    expect(e.getEnrichment("run-a")!.profile.emails).toEqual(["hi@owner-site.com"]);
    const contactA = db.select().from(s.contacts).where(eq(s.contacts.placeId, "run-a")).get()!;
    expect(contactA).toMatchObject({ ownerName: "Jane Doe", source: "enrichment" });
    expect(e.getEnrichment("run-b")!.profile.people).toHaveLength(2); // stored and shown, but no owner chosen
    expect(db.select().from(s.contacts).where(eq(s.contacts.placeId, "run-b")).get()).toBeUndefined();
    expect(e.getEnrichment("run-c")).toBeNull(); // no result: stays a candidate, nothing recorded

    // polling again after it finished does nothing
    const before = calls.length;
    await e.syncEnrichment(started.runId);
    expect(calls.length).toBe(before);
    expect(e.placesInFlight().size).toBe(0);
  });

  it("ignores rows the actor marked as failed, so the business stays a candidate", () => {
    place("failed-row", "https://failed-row.com");
    const res = e.applyResults(
      [{ placeId: "failed-row", url: "https://failed-row.com" }],
      [{ success: false, url: "https://failed-row.com", error: "timeout", people: [], emails: null }],
      "actor",
    );
    expect(res).toEqual({ enriched: 0, owners: 0 });
    expect(e.getEnrichment("failed-row")).toBeNull();
  });

  it("never overwrites an owner name you typed, and keeps do-not-contact", () => {
    place("manual", "https://manual.com");
    db.insert(s.contacts).values({ placeId: "manual", ownerName: "Typed Name", source: "manual", doNotContact: true }).run();
    const res = e.applyResults([{ placeId: "manual", url: "https://manual.com" }], [{ url: "https://manual.com", people: [{ name: "Scraped Name", title: "Owner" }] }], "actor");
    expect(res).toEqual({ enriched: 1, owners: 0 });
    expect(db.select().from(s.contacts).where(eq(s.contacts.placeId, "manual")).get()).toMatchObject({ ownerName: "Typed Name", doNotContact: true });
  });

  it("picks candidates from a table filter: best score first, skipping done, no-site and do-not-contact", () => {
    place("c-hi", "https://hi.com");
    db.update(s.nichePlaces).set({ score: 90 }).where(eq(s.nichePlaces.placeId, "c-hi")).run();
    const { stats, targets } = e.findCandidates(nicheId, { rel: "all", sort: "score", dir: "desc", page: 1 }, 2);
    expect(targets[0].placeId).toBe("c-hi");
    expect(targets).toHaveLength(2);
    expect(stats.alreadyEnriched).toBeGreaterThanOrEqual(2); // run-a, run-b and the manual one
    expect(stats.noWebsite).toBeGreaterThanOrEqual(2); // nosite + social
    expect(stats.doNotContact).toBeGreaterThanOrEqual(1);
    expect(stats.eligible).toBeGreaterThanOrEqual(2);
  });
});
