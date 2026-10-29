import { describe, expect, it } from "vitest";
import { normalizeItem, parseDatasetJson } from "./normalize";

describe("parseDatasetJson", () => {
  it("keeps a 19-digit cid exact (a JS number would round it)", () => {
    const text = '[{"title":"A","placeId":"p1","cid":16644497406215546755}]';
    expect(JSON.parse(text)[0].cid).not.toBe("16644497406215546755"); // lossy without the fix
    expect(parseDatasetJson(text)[0].cid).toBe("16644497406215546755");
  });

  it("leaves already-quoted cids alone", () => {
    expect(parseDatasetJson('[{"cid":"7066208495966248491"}]')[0].cid).toBe("7066208495966248491");
  });
});

describe("normalizeItem", () => {
  it("maps the fields we keep and the search provenance", () => {
    const r = normalizeItem({
      title: "Houston Concrete Staining",
      placeId: "ChIJabc",
      cid: "13148777102842020596",
      categories: ["Concrete contractor", "Painter"],
      domain: "www.HoustonConcreteStaining.com",
      totalScore: 4.8,
      ratingCount: 116,
      location: { lat: 30.1, lng: -95.4 },
      query: "decorative concrete",
      searchGridIndex: 3,
      searchCenter: { lat: 29.935, lng: -95.5 },
    })!;
    expect(r.place).toMatchObject({
      placeId: "ChIJabc",
      cid: "13148777102842020596",
      domain: "houstonconcretestaining.com",
      totalScore: 4.8,
      reviewsCount: 116,
      lat: 30.1,
    });
    expect(r.place.categories).toEqual(["Concrete contractor", "Painter"]);
    expect(r.prov).toEqual({
      query: "decorative concrete",
      searchGridIndex: 3,
      searchLat: 29.935,
      searchLng: -95.5,
    });
  });

  it("reads flattened CSV-style columns", () => {
    const r = normalizeItem({
      title: "BDC Coatings",
      cid: "7930604380882469307",
      "categories/0": "Flooring contractor",
      "categories/1": "",
      "searchCenter/lat": "30.07973",
      "searchCenter/lng": "-95.41769",
      searchGridIndex: "0",
      searchString: "epoxy flooring",
    })!;
    expect(r.place.placeId).toBe("cid:7930604380882469307");
    expect(r.place.categories).toEqual(["Flooring contractor"]);
    expect(r.prov.searchLat).toBeCloseTo(30.07973);
    expect(r.prov.query).toBe("epoxy flooring");
  });

  it("derives the domain from website and drops rows with no id or title", () => {
    expect(normalizeItem({ title: "X", placeId: "p", website: "https://www.foo.com/a" })!.place.domain).toBe("foo.com");
    expect(normalizeItem({ placeId: "p" })).toBeNull();
    expect(normalizeItem({ title: "No ids" })).toBeNull();
  });
});
