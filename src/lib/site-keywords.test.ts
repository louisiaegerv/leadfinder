import { beforeAll, describe, expect, it } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import type { Fetched, Fetcher } from "./site-scan";

const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "lf-kw-")), "t.db");
process.env.DATABASE_PATH = tmp;

const FILL = "We have served the Houston area for many years with friendly and dependable service. ".repeat(8);
const page = (head: string, body: string): Fetched => ({
  status: 200,
  finalUrl: "https://x/",
  contentType: "text/html",
  html: `<html><head><title>Home</title>${head}</head><body><h2>${body}</h2><p>${FILL}</p></body></html>`,
});

describe("a website scan settles businesses the rules could not", () => {
  let db: typeof import("@/db").db;
  let s: typeof import("@/db").schema;
  let sd: typeof import("./site-scan-db");
  let eq: typeof import("drizzle-orm").eq;
  let nicheId = 0;
  const row = (id: string) => db.select().from(s.nichePlaces).where(eq(s.nichePlaces.placeId, id)).get()!;

  const sites: Record<string, Fetched> = {
    "https://coater.test/": page(`<meta name="description" content="Garage floor coatings">`, "Epoxy and polyaspartic floors"),
    "https://installer.test/": page(`<meta name="description" content="Hardwood, tile and carpet">`, "Our flooring services"),
    "https://chosen.test/": page("", "Epoxy floors"),
  };
  const fetcher: Fetcher = async (u) => sites[u] ?? { status: 404, finalUrl: u, contentType: "text/html", html: "" };

  beforeAll(async () => {
    ({ db, schema: s } = await import("@/db"));
    sd = await import("./site-scan-db");
    ({ eq } = await import("drizzle-orm"));
    const { playbookSchema } = await import("./playbook");
    nicheId = db
      .insert(s.niches)
      .values({
        name: "Coatings",
        target: "",
        playbook: playbookSchema.parse({ includeCategories: ["Concrete contractor"], broadCategories: ["Flooring contractor"], includeKeywords: ["epoxy", "polyaspartic"] }),
      })
      .returning()
      .get().id;
    for (const [id, site] of [["COATER", "coater.test"], ["INSTALLER", "installer.test"], ["CHOSEN", "chosen.test"]]) {
      db.insert(s.places).values({ placeId: id, title: `Biz ${id}`, categories: ["Flooring contractor"], website: `https://${site}/`, domain: site, scrapedAt: new Date() }).run();
    }
    // As ingest leaves them: a broad category alone is not enough, so the rules say "undecided".
    db.insert(s.nichePlaces).values([
      { nicheId, placeId: "COATER", relevance: null },
      { nicheId, placeId: "INSTALLER", relevance: null },
      { nicheId, placeId: "CHOSEN", relevance: "noise", relevanceSource: "user" },
    ]).run();
  });

  it("marks the coater a target from what its site says, and leaves the plain installer undecided", async () => {
    await sd.scanPlaces(["COATER", "INSTALLER", "CHOSEN"], { fetcher });
    expect(row("COATER")).toMatchObject({ relevance: "target", relevanceSource: "rules" });
    expect(row("COATER").relevanceReason).toContain('on their website');
    expect(row("INSTALLER")).toMatchObject({ relevance: null });
    expect(row("INSTALLER").relevanceReason).toBe('Broad category "Flooring contractor" with no keyword');
  });

  it("leaves a site the scan could not read undecided, and the paid reader's text can then settle it", async () => {
    const { playbookSchema } = await import("./playbook");
    const { reclassifyNiche } = await import("./rescore");
    const { NO_READ_REASON } = await import("./relevance");
    const plain = { ...playbookSchema.parse({ includeCategories: ["Concrete contractor"], includeKeywords: ["epoxy", "polyaspartic"] }) };
    db.update(s.niches).set({ playbook: plain }).where(eq(s.niches.id, nicheId)).run();
    for (const id of ["BLOCKED", "BLOCKED2"]) {
      db.insert(s.places).values({ placeId: id, title: `Biz ${id}`, categories: ["General contractor"], website: `https://${id.toLowerCase()}.test/`, domain: `${id.toLowerCase()}.test`, scrapedAt: new Date() }).run();
      db.insert(s.nichePlaces).values({ nicheId, placeId: id, relevance: "noise", relevanceSource: "rules", relevanceReason: "No target category or keyword" }).run();
    }
    const forbidden = async (u: string) => ({ status: 403, finalUrl: u, contentType: "text/html", html: "Forbidden" });
    await sd.scanPlaces(["BLOCKED", "BLOCKED2"], { fetcher: forbidden });
    expect(row("BLOCKED")).toMatchObject({ relevance: null, relevanceReason: NO_READ_REASON });

    // The paid reader reads one of them and finds the work it does; the other it reads and finds nothing relevant.
    db.insert(s.enrichment).values({ placeId: "BLOCKED", kind: "profile", source: "actor", data: { description: "Epoxy and polyaspartic garage floors", services: null, serviceArea: null, people: [], emails: [], phones: [], socials: {} } }).run();
    db.insert(s.enrichment).values({ placeId: "BLOCKED2", kind: "profile", source: "actor", data: { description: "Roofing and gutters", services: null, serviceArea: null, people: [], emails: [], phones: [], socials: {} } }).run();
    reclassifyNiche(nicheId);
    expect(row("BLOCKED")).toMatchObject({ relevance: "target" });
    expect(row("BLOCKED2")).toMatchObject({ relevance: "noise", relevanceReason: "No target category or keyword" });
  });

  it("never overrides a decision you made", () => {
    expect(row("CHOSEN")).toMatchObject({ relevance: "noise", relevanceSource: "user" });
  });
});
