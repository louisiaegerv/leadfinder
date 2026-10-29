import { beforeAll, describe, expect, it } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { MAX_OWNER_NAME } from "./owner-limits";

const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "lf-own-man-")), "t.db");
process.env.DATABASE_PATH = tmp;

describe("typing in an owner by hand", () => {
  let db: typeof import("@/db").db;
  let s: typeof import("@/db").schema;
  let o: typeof import("./outreach-db");
  let ed: typeof import("./enrich-db");
  let eq: typeof import("drizzle-orm").eq;

  const mk = (id: string) => db.insert(s.places).values({ placeId: id, title: `Biz ${id}`, categories: [], scrapedAt: new Date() }).run();
  const contact = (id: string) => db.select().from(s.contacts).where(eq(s.contacts.placeId, id)).get();

  beforeAll(async () => {
    ({ db, schema: s } = await import("@/db"));
    o = await import("./outreach-db");
    ed = await import("./enrich-db");
    ({ eq } = await import("drizzle-orm"));
  });

  it("saves the name as yours, with full confidence, and tidies it", () => {
    mk("A");
    expect(o.setManualOwner("A", "   Juan   Gonzalez \n")).toEqual({ ownerName: "Juan Gonzalez" });
    expect(contact("A")).toMatchObject({ ownerName: "Juan Gonzalez", source: "manual", confidence: 1, doNotContact: false });
  });

  it("keeps the name to a sane length", () => {
    mk("LONG");
    expect(o.setManualOwner("LONG", "x".repeat(500)).ownerName).toHaveLength(MAX_OWNER_NAME);
  });

  it("replaces an automatic owner, and then no scan or search can ever replace it", () => {
    mk("B");
    ed.saveOwner(db, "B", "Scraped Person", 0.9, "search");
    expect(contact("B")!.source).toBe("search");
    o.setManualOwner("B", "Real Owner");
    expect(contact("B")).toMatchObject({ ownerName: "Real Owner", source: "manual" });
    for (const source of ["search", "enrichment", "site"] as const) expect(ed.saveOwner(db, "B", "Machine Guess", 0.95, source)).toBe(false);
    expect(contact("B")!.ownerName).toBe("Real Owner");
  });

  it("can be edited again, and an edit replaces your own earlier name", () => {
    mk("C");
    o.setManualOwner("C", "Jon Smith");
    o.setManualOwner("C", "John Smith");
    expect(contact("C")!.ownerName).toBe("John Smith");
  });

  it("leaves do-not-contact exactly as it was", () => {
    mk("D");
    db.insert(s.contacts).values({ placeId: "D", doNotContact: true }).run();
    o.setManualOwner("D", "Dee Owner");
    expect(contact("D")).toMatchObject({ ownerName: "Dee Owner", doNotContact: true });
    o.setManualOwner("D", null);
    expect(contact("D")).toMatchObject({ ownerName: null, doNotContact: true });
  });

  it("clearing forgets the name and where it came from, so a later search can fill it in again", () => {
    mk("E");
    o.setManualOwner("E", "Wrong Name");
    expect(o.setManualOwner("E", "   ")).toEqual({ ownerName: null }); // whitespace counts as empty
    expect(contact("E")).toMatchObject({ ownerName: null, source: null, confidence: null });
    expect(ed.saveOwner(db, "E", "Found By Search", 0.8, "search")).toBe(true);
    expect(contact("E")).toMatchObject({ ownerName: "Found By Search", source: "search" });
  });

  it("clearing a business that has no contact yet does nothing, and does not invent a row", () => {
    mk("F");
    expect(o.setManualOwner("F", null)).toEqual({ ownerName: null });
    expect(contact("F")).toBeUndefined();
  });

  it("refuses a business that does not exist", () => {
    expect(() => o.setManualOwner("NO-SUCH-PLACE", "Someone")).toThrow();
  });
});
