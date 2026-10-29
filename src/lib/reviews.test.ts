import { describe, expect, it } from "vitest";
import { ageLabel, readReviews, reviewCostUsd, reviewStats } from "./reviews";

// Trimmed from a real run of the Maps actor with reviews on (New Era Epoxy Flooring), newest first.
const rev = (over: Record<string, unknown>) => ({ reviewId: "x", name: "A", stars: 5, text: null, publishedAtDate: "2026-08-11T00:55:19Z", publishAt: "2 months ago", responseFromOwnerText: null, rating: 5, publishedAtTimestamp: "2026-08-11T00:55:19Z", ...over });
const REAL = [
  rev({ reviewId: "a", name: "William Lynch", text: "New Era Epoxy did our shop floor and 4 car garage.", publishedAtDate: "2026-08-11T00:55:19Z" }),
  rev({ reviewId: "b", name: "Michael K", text: "We got numerous bids...", publishedAtDate: "2026-07-24T15:01:44Z" }),
  rev({ reviewId: "c", name: "Taylor Sample", text: "They’re amazing.", publishedAtDate: "2026-07-16T21:33:14Z" }),
  rev({ reviewId: "d", name: "Ruby Zaed", text: null, publishedAtDate: "2026-06-24T18:39:56Z", responseFromOwnerText: "Thank you Ruby!", responseFromOwnerDate: "4 months ago" }),
  rev({ reviewId: "e", name: "John Dyke", text: null, publishedAtDate: "2026-06-18T15:03:31Z", responseFromOwnerText: "Thank you for the 5 stars John!" }),
];
const NOW = new Date("2026-10-29T12:00:00Z");

describe("readReviews", () => {
  it("reads the actor's review records into a small sample, newest first, with reply flags", () => {
    const s = readReviews(REAL)!;
    expect(s.map((r) => r.id)).toEqual(["a", "b", "c", "d", "e"]);
    expect(s[0]).toEqual({ id: "a", stars: 5, at: "2026-08-11T00:55:19.000Z", text: "New Era Epoxy did our shop floor and 4 car garage.", replied: false });
    expect(s.map((r) => r.replied)).toEqual([false, false, false, true, true]);
    expect(s[3].text).toBeNull();
    expect(JSON.stringify(s)).not.toContain("William Lynch"); // reviewer names are not kept
  });

  it("puts them in date order whatever order they arrive in, and drops duplicates", () => {
    const s = readReviews([REAL[3], REAL[0], REAL[0], REAL[2]])!;
    expect(s.map((r) => r.id)).toEqual(["a", "c", "d"]);
  });

  it("tells 'not asked for' (null) from 'asked, none exist' (empty list)", () => {
    expect(readReviews(undefined)).toBeNull();
    expect(readReviews(null)).toBeNull();
    expect(readReviews("nope")).toBeNull();
    expect(readReviews([])).toEqual([]);
  });

  it("skips records it cannot date, copes with junk, and trims long text and odd ratings", () => {
    const s = readReviews([
      { reviewId: "no-date", publishAt: "2 months ago", stars: 5 },
      "junk",
      null,
      rev({ reviewId: "long", text: "x".repeat(900), stars: 9 }),
      rev({ reviewId: "ts", publishedAtDate: undefined, publishedAtTimestamp: "2026-05-01T00:00:00Z", stars: undefined, rating: 2 }),
      rev({ reviewId: "bad", publishedAtDate: "not a date", publishedAtTimestamp: undefined }),
    ])!;
    expect(s.map((r) => r.id)).toEqual(["long", "ts"]);
    expect(s[0].text).toHaveLength(300);
    expect(s[0].stars).toBeNull(); // 9 is not a star rating
    expect(s[1].stars).toBe(2); // falls back to `rating`
  });

  it("keeps at most ten", () => {
    const many = Array.from({ length: 30 }, (_, i) => rev({ reviewId: `r${i}`, publishedAtDate: new Date(Date.UTC(2026, 0, 1 + i)).toISOString() }));
    expect(readReviews(many)).toHaveLength(10);
    expect(readReviews(many)![0].id).toBe("r29");
  });
});

describe("reviewStats", () => {
  it("measures how long since the last review, how often they came, and whether the owner replies", () => {
    const st = reviewStats(readReviews(REAL), NOW)!;
    expect(st).toMatchObject({ count: 5, newestDays: 79, oldestDays: 132, replied: 2, lowRecent: 0 });
    expect(st.perMonth).toBeCloseTo(2.3, 1); // 4 gaps over 53 days
  });

  it("counts recent bad reviews only within 90 days", () => {
    const s = readReviews([
      rev({ reviewId: "1", stars: 1, publishedAtDate: "2026-10-01T00:00:00Z" }),
      rev({ reviewId: "2", stars: 2, publishedAtDate: "2026-09-10T00:00:00Z" }),
      rev({ reviewId: "3", stars: 1, publishedAtDate: "2026-03-01T00:00:00Z" }),
      rev({ reviewId: "4", stars: 5, publishedAtDate: "2026-09-20T00:00:00Z" }),
    ]);
    expect(reviewStats(s, NOW)!.lowRecent).toBe(2);
  });

  it("gives no rate for a tiny or same-day sample, and nothing at all with no reviews", () => {
    expect(reviewStats(readReviews([REAL[0], REAL[1]]), NOW)!.perMonth).toBeNull();
    expect(reviewStats(readReviews([rev({ reviewId: "1" }), rev({ reviewId: "2" }), rev({ reviewId: "3" })]), NOW)!.perMonth).toBeNull();
    expect(reviewStats([], NOW)).toBeNull();
    expect(reviewStats(null, NOW)).toBeNull();
    expect(reviewStats(undefined, NOW)).toBeNull();
  });

  it("never reports a negative age for a review dated in the future", () => {
    expect(reviewStats(readReviews([rev({ publishedAtDate: "2026-12-01T00:00:00Z" })]), NOW)!.newestDays).toBe(0);
  });
});

describe("ageLabel and cost", () => {
  it("reads naturally", () => {
    expect([1, 12, 59, 60, 79, 200, 400, 730].map(ageLabel)).toEqual(["1 day", "12 days", "59 days", "2 months", "3 months", "7 months", "1.1 years", "2 years"]);
  });

  it("prices reviews at $0.25 per 1,000, as an upper bound", () => {
    expect(reviewCostUsd(1000, 5)).toBeCloseTo(1.25, 6);
    expect(reviewCostUsd(500, 5)).toBeCloseTo(0.625, 6);
    expect(reviewCostUsd(0, 5)).toBe(0);
  });
});
