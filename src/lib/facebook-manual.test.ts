import { beforeAll, describe, expect, it } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { parseManualFacebook } from "./facebook-search";

const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "lf-fbman-")), "t.db");
process.env.DATABASE_PATH = tmp;

describe("parseManualFacebook", () => {
  it("accepts a link with or without https and reduces it to the page", () => {
    expect(parseManualFacebook("facebook.com/AcmeEpoxy", null)).toEqual({ url: "https://www.facebook.com/AcmeEpoxy", pageId: null });
    expect(parseManualFacebook(" https://m.facebook.com/AcmeEpoxy/reviews ", "")).toEqual({ url: "https://www.facebook.com/AcmeEpoxy", pageId: null });
    expect(parseManualFacebook("https://www.facebook.com/profile.php?id=100063123456789", null)).toEqual({
      url: "https://www.facebook.com/profile.php?id=100063123456789",
      pageId: "100063123456789",
    });
  });

  it("uses the typed page ID, and makes a link from an ID alone", () => {
    expect(parseManualFacebook("facebook.com/AcmeEpoxy", "123456789012345")).toEqual({ url: "https://www.facebook.com/AcmeEpoxy", pageId: "123456789012345" });
    expect(parseManualFacebook(null, " 123456789012345 ")).toEqual({ url: "https://www.facebook.com/profile.php?id=123456789012345", pageId: "123456789012345" });
  });

  it("treats two empty fields as none, and refuses what is not a Facebook page", () => {
    expect(parseManualFacebook("  ", null)).toBeNull();
    expect(() => parseManualFacebook("https://example.com/AcmeEpoxy", null)).toThrow(/Facebook page/);
    expect(() => parseManualFacebook("javascript:alert(1)", null)).toThrow(/Facebook page/);
    expect(() => parseManualFacebook("facebook.com/AcmeEpoxy", "abc")).toThrow(/number/);
    expect(() => parseManualFacebook(null, "12")).toThrow(/number/);
  });
});

describe("setManualFacebook", () => {
  let db: typeof import("@/db").db;
  let s: typeof import("@/db").schema;
  let f: typeof import("./facebook-manual-db");
  let eq: typeof import("drizzle-orm").eq;
  const row = (placeId: string) => db.select().from(s.facebookProfiles).where(eq(s.facebookProfiles.placeId, placeId)).get();

  beforeAll(async () => {
    ({ db, schema: s } = await import("@/db"));
    f = await import("./facebook-manual-db");
    ({ eq } = await import("drizzle-orm"));
    db.insert(s.places).values(["A", "B", "C"].map((placeId) => ({ placeId, title: placeId, categories: [], scrapedAt: new Date() }))).run();
  });

  it("saves the page as yours, with full confidence", () => {
    expect(f.setManualFacebook("A", "facebook.com/Acme", "123456789012345")).toEqual({ pageUrl: "https://www.facebook.com/Acme", pageId: "123456789012345" });
    expect(row("A")).toMatchObject({ pageUrl: "https://www.facebook.com/Acme", pageId: "123456789012345", matchSource: "user", matchConfidence: 1, userOverride: true });
  });

  it("replaces a page found by search and forgets the ad check made on it", () => {
    db.insert(s.facebookProfiles).values({
      placeId: "B", pageUrl: "https://www.facebook.com/Wrong", pageId: "999999999", matchSource: "search", matchConfidence: 0.5, state: "active_ads",
      adLibrary: { activeAds: 3 }, checkedAt: new Date(),
    }).run();
    f.setManualFacebook("B", "facebook.com/Right", null);
    expect(row("B")).toMatchObject({ pageUrl: "https://www.facebook.com/Right", pageId: null, matchSource: "user", state: null, adLibrary: null, checkedAt: null });
  });

  it("keeps the ad check when the same page is saved again", () => {
    db.update(s.facebookProfiles).set({ state: "page_no_ads" }).where(eq(s.facebookProfiles.placeId, "A")).run();
    f.setManualFacebook("A", "https://www.facebook.com/Acme/", "123456789012345");
    expect(row("A")!.state).toBe("page_no_ads");
  });

  it("clears the page and its source, so a later search can fill it in", () => {
    expect(f.setManualFacebook("A", "", null)).toEqual({ pageUrl: null, pageId: null });
    expect(row("A")).toMatchObject({ pageUrl: null, pageId: null, matchSource: null, userOverride: false, state: null });
    expect(f.setManualFacebook("C", null, null)).toEqual({ pageUrl: null, pageId: null }); // nothing to clear is fine
    expect(row("C")).toBeUndefined();
  });

  it("rejects bad input and unknown businesses without touching anything", () => {
    expect(() => f.setManualFacebook("B", "https://example.com/x", null)).toThrow();
    expect(row("B")!.pageUrl).toBe("https://www.facebook.com/Right");
    expect(() => f.setManualFacebook("NO-SUCH-PLACE", "facebook.com/x", null)).toThrow();
  });
});
