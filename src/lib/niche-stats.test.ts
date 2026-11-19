import { beforeAll, describe, expect, it } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "lf-stats-")), "t.db");
process.env.DATABASE_PATH = tmp;

let stats: ReturnType<typeof import("./niche-stats").getNicheStats>;

beforeAll(async () => {
  const { db, schema: s } = await import("@/db");
  const { getNicheStats } = await import("./niche-stats");
  const { emptyPlaybook } = await import("./playbook");
  const now = new Date();
  const niche = db.insert(s.niches).values({ name: "Epoxy", target: "", playbook: emptyPlaybook() }).returning().get();
  const other = db.insert(s.niches).values({ name: "Roofing", target: "", playbook: emptyPlaybook() }).returning().get();

  const biz = (placeId: string, domain: string | null, website: string | null = domain ? `https://${domain}` : null) => ({
    placeId, title: placeId, categories: [], domain, website, scrapedAt: now,
  });
  db.insert(s.places).values([
    biz("none", null),                  // no website
    biz("fb", "facebook.com"),          // social page only
    biz("dead", "gone.com"),            // scanned, did not load
    biz("ok", "fine.com"),              // scanned, loaded
    biz("unscanned", "new.com"),        // never scanned
    biz("noise", null),                 // ruled out: ignored everywhere
    biz("elsewhere", null),             // only in the other niche
  ]).run();
  const np = (placeId: string, relevance: "target" | "adjacent" | "noise" | null, nicheId = niche.id) => ({ nicheId, placeId, relevance });
  db.insert(s.nichePlaces).values([
    np("none", "target"), np("fb", "adjacent"), np("dead", "target"), np("ok", null), np("unscanned", "target"), np("noise", "noise"),
    np("elsewhere", "target", other.id),
  ] as never).run();

  db.insert(s.enrichment).values([
    { placeId: "dead", kind: "site_scan", data: { outcome: "dead" }, source: "site-scan" },
    { placeId: "ok", kind: "site_scan", data: { outcome: "ok" }, source: "site-scan" },
    { placeId: "noise", kind: "site_scan", data: { outcome: "dead" }, source: "site-scan" },
  ]).run();
  db.insert(s.facebookProfiles).values([
    { placeId: "ok", pageUrl: "https://facebook.com/ok" },
    { placeId: "noise", pageUrl: "https://facebook.com/noise" },
    { placeId: "none", pageUrl: null }, // a row with no page found is not "has Facebook"
  ]).run();
  db.insert(s.contacts).values([
    { placeId: "dead", ownerName: "Dee Owner" },
    { placeId: "ok", ownerName: "  " },
    { placeId: "noise", ownerName: "Nora Noise" },
  ]).run();

  stats = getNicheStats(niche.id);
});

describe("getNicheStats", () => {
  it("counts how the businesses sort out", () => {
    expect(stats.relevance).toMatchObject({ target: 3, adjacent: 1, gray: 1, noise: 1, total: 6 });
  });

  it("only looks at businesses not ruled out as noise", () => {
    expect(stats.prospects).toBe(5);
    expect(stats.withFacebook).toBe(1);
    expect(stats.withOwner).toBe(1);
  });

  it("separates no website, social-only and broken websites", () => {
    expect(stats.noWebsite).toBe(1);
    expect(stats.socialOnly).toBe(1);
    expect(stats.brokenWebsite).toBe(1);
    expect(stats.scanned).toBe(2); // dead and ok; "unscanned" has no scan yet
  });
});
