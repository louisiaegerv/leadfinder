import { beforeAll, describe, expect, it } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
import { stamped, toCsv } from "./csv";

const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "lf-export-")), "t.db");
process.env.DATABASE_PATH = tmp;

describe("csv", () => {
  it("quotes commas, quotes and line breaks, and starts with a byte-order mark", () => {
    const out = toCsv(["A", "B"], [["a,b", 'say "hi"'], ["line\nbreak", null], [3, true]]);
    expect(out.startsWith("﻿")).toBe(true);
    expect(out).toBe('﻿A,B\r\n"a,b","say ""hi"""\r\n"line\nbreak",\r\n3,true\r\n');
  });

  it("stops text from running as a spreadsheet formula, but leaves phone numbers alone", () => {
    const body = toCsv(["x"], [["=HYPERLINK(\"http://evil\")"], ["@SUM(A1)"], ["-2+3"], ["+cmd"], ["+1 (713) 555-0100"], ["-5"], ["Plain Name"]]);
    const cells = body.split("\r\n").slice(1, -1);
    expect(cells[0]).toBe('"\'=HYPERLINK(""http://evil"")"');
    expect(cells[1]).toBe("'@SUM(A1)");
    expect(cells[2]).toBe("'-2+3");
    expect(cells[3]).toBe("'+cmd");
    expect(cells.slice(4)).toEqual(["+1 (713) 555-0100", "-5", "Plain Name"]);
  });

  it("names files with the date", () => {
    expect(stamped("leadfinder", "db", new Date("2026-10-29T12:00:00Z"))).toBe("leadfinder-2026-10-29.db");
  });
});

describe("exports", () => {
  let db: typeof import("@/db").db;
  let s: typeof import("@/db").schema;
  let x: typeof import("./export-db");

  beforeAll(async () => {
    ({ db, schema: s } = await import("@/db"));
    x = await import("./export-db");
    const now = new Date();
    const { emptyPlaybook } = await import("./playbook");
    db.insert(s.niches).values({ name: "Epoxy", target: "", playbook: emptyPlaybook() }).run();
    db.insert(s.areas).values({ nicheId: 1, name: "Houston", shape: "radius", centerLat: 29.7, centerLng: -95.3, radiusKm: 10, queries: ["epoxy"] } as never).run();
    db.insert(s.places).values([
      { placeId: "P1", title: "=Evil Floors", categories: [], phone: "+1 713 555 0100", city: "Houston", state: "TX", totalScore: 4.5, reviewsCount: 12, scrapedAt: now },
      { placeId: "P2", title: "Good Floors, LLC", categories: [], scrapedAt: now },
    ]).run();
    db.insert(s.nichePlaces).values([
      { nicheId: 1, placeId: "P1", areaId: 1, relevance: "target", score: 71.6, leadOffer: "facebook_ads", stage: "dialed" },
      { nicheId: 1, placeId: "P2", areaId: 1, stage: "new" },
    ] as never).run();
    db.insert(s.contacts).values({ placeId: "P1", ownerName: "Dee Owner", doNotContact: true }).run();
    db.insert(s.facebookProfiles).values({ placeId: "P1", pageUrl: "https://facebook.com/evil", userOverride: false }).run();
    db.insert(s.contactLog).values({ placeId: "P1", nicheId: 1, outcome: "no_answer", notes: "left voicemail", createdAt: now }).run();
    db.insert(s.runs).values({ areaId: 1, apifyRunId: "AR1", datasetId: "DS1", inputs: {}, status: "ingested", resultCount: 2, costUsd: 0.5, createdAt: now }).run();
    db.insert(s.enrichmentRuns).values({ apifyRunId: "AR2", datasetId: "DS2", kind: "search", status: "ingested", targets: [{ placeId: "P1", url: "" }], enrichedCount: 1, costUsd: 0.001, createdAt: new Date(now.getTime() + 1000) }).run();
  });

  it("lists every business per niche with score, owner, do-not-contact and facebook", () => {
    const rows = x.prospectRows();
    expect(rows).toHaveLength(2);
    const header = x.PROSPECT_HEADER;
    const col = (name: string) => header.indexOf(name);
    const p1 = rows.find((r) => r[col("Business")] === "=Evil Floors")!;
    expect(p1[col("Niche")]).toBe("Epoxy");
    expect(p1[col("Score")]).toBe(72);
    expect(p1[col("Owner")]).toBe("Dee Owner");
    expect(p1[col("Do not contact")]).toBe("yes");
    expect(p1[col("Facebook page")]).toBe("https://facebook.com/evil");
    expect(p1[col("Google Maps")]).toContain("place_id:P1");
    const p2 = rows.find((r) => r[col("Business")] === "Good Floors, LLC")!;
    expect(p2[col("Relevance")]).toBe("undecided");
    expect(p2[col("Score")]).toBe("");
    expect(rows.every((r) => r.length === header.length)).toBe(true);
  });

  it("lists the call log with the business it belongs to", () => {
    const rows = x.callRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].slice(1, 8)).toEqual(["=Evil Floors", "+1 713 555 0100", "Epoxy", "no_answer", "", null, "left voicemail"]);
    expect(rows.every((r) => r.length === x.CALL_HEADER.length)).toBe(true);
  });

  it("lists scrape runs and enrichment runs together, newest first, with their Apify ids", () => {
    const rows = x.listApifyRuns();
    expect(rows.map((r) => [r.source, r.label, r.apifyRunId, r.datasetId])).toEqual([
      ["enrich", "Owner search", "AR2", "DS2"],
      ["maps", "Google Maps scrape", "AR1", "DS1"],
    ]);
    expect(rows[1].detail).toBe("Epoxy, Houston");
    expect(rows[0].detail).toBe("1 business");
  });

  it("only hands out datasets that belong to our own runs", () => {
    expect(x.findRunDataset("maps", 1)).toEqual({ datasetId: "DS1", name: "apify-maps-run-1.json" });
    expect(x.findRunDataset("enrich", 1)).toEqual({ datasetId: "DS2", name: "apify-search-run-1.json" });
    expect(x.findRunDataset("maps", 999)).toBeNull();
    expect(x.findRunDataset("other", 1)).toBeNull();
  });

  it("makes a backup that opens as a database with the same data, and cleans up after itself", () => {
    const b = x.makeBackup();
    const copy = new Database(b.file, { readonly: true });
    expect((copy.prepare("select count(*) n from places").get() as { n: number }).n).toBe(2);
    expect((copy.prepare("select owner_name o from contacts").get() as { o: string }).o).toBe("Dee Owner");
    expect(copy.pragma("integrity_check", { simple: true })).toBe("ok");
    copy.close();
    b.cleanup();
    expect(fs.existsSync(b.file)).toBe(false);
  });
});
