import { describe, expect, it } from "vitest";
import { ageLabel, readReviews, reviewCostUsd, reviewFetchLines, reviewStats } from "./reviews";

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
    expect(s.map((r) => r.reply)).toEqual([undefined, undefined, undefined, "Thank you Ruby!", "Thank you for the 5 stars John!"]);
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
      rev({ reviewId: "4", stars: 5, publishedAtDate: "2026-09-20T12:00:00Z" }),
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

describe("reviewFetchLines", () => {
  const review = (at: string) => ({ id: at, stars: 5, at, text: null, replied: false });
  const when = new Date("2026-10-01T12:00:00Z");

  it("says what a first fetch will do", () => {
    const lines = reviewFetchLines({ sample: null, sampledAt: null, maxReviews: 5 });
    expect(lines[0]).toBe("Fetches the newest 5 Google reviews of this business, through Apify.");
    expect(lines[1]).toBe("No reviews have been fetched for this business yet.");
    expect(lines.join(" ")).toMatch(/re-scores it in every niche/);
  });

  it("says what a refresh will replace, with dates", () => {
    const lines = reviewFetchLines({ sample: [review("2026-09-20T12:00:00Z"), review("2026-08-01T12:00:00Z")], sampledAt: when, maxReviews: 5 });
    expect(lines[1]).toBe("Replaces the 2 reviews saved on Oct 1, 2026 (the newest is from Sep 20, 2026).");
  });

  it("is correct for one review, and for a business that had none", () => {
    expect(reviewFetchLines({ sample: [review("2026-09-20T12:00:00Z")], sampledAt: when, maxReviews: 5 })[1]).toContain("Replaces the 1 review saved");
    expect(reviewFetchLines({ sample: [], sampledAt: when, maxReviews: 5 })[1]).toBe("Last fetched on Oct 1, 2026: it had no reviews.");
  });
});

describe("readReviews with the same review returned twice", () => {
  // The shape Apify returned for Pro Level Floor Coatings: each review as a short record and again as a fuller one with the reply.
  const short = (reviewId: string, name: string, at: string, text: string) => ({ reviewId, name, stars: 5, text, publishedAtDate: at, likesCount: 0 });
  const full = (reviewId: string, name: string, at: string, text: string, reply?: string) => ({
    reviewId, name, author: name, rating: 5, text, publishedAtDate: at, publishedAtTimestamp: at, likesCount: 2,
    ...(reply ? { responseFromOwnerText: reply, responseFromOwnerDate: "a day ago" } : {}),
  });
  const raw = [
    short("A", "Susan", "2026-10-28T20:08:00Z", "Such friendly service."),
    full("A", "Susan", "2026-10-28T20:08:00Z", "Such friendly service.", "Susan, we appreciate your kind words."),
    short("B", "Maureen", "2026-10-27T20:50:20Z", "Couldn't be happier."),
    full("B", "Maureen", "2026-10-27T20:50:20Z", "Couldn't be happier.", "Thank you, Maureen."),
    short("C", "Jen", "2026-10-15T14:53:49Z", "Fantastic service!"),
  ];

  it("keeps the owner's reply when it is on the second copy", () => {
    const out = readReviews(raw)!;
    expect(out.map((r) => [r.id, r.replied])).toEqual([["A", true], ["B", true], ["C", false]]);
  });

  it("gives one review per reviewId, newest first", () => {
    expect(readReviews(raw)!.map((r) => r.id)).toEqual(["A", "B", "C"]);
  });

  it("finds the reply whichever copy comes first", () => {
    const flipped = [full("A", "Susan", "2026-10-28T20:08:00Z", "Great.", "Thanks!"), short("A", "Susan", "2026-10-28T20:08:00Z", "Great.")];
    expect(readReviews(flipped)).toHaveLength(1);
    expect(readReviews(flipped)![0].replied).toBe(true);
  });

  it("fills in what one copy lacks from the other, and still dedupes without a reviewId", () => {
    const merged = readReviews([{ reviewerId: "9", publishedAtDate: "2026-10-01T12:00:00Z", stars: null }, { reviewerId: "9", publishedAtDate: "2026-10-01T12:00:00Z", rating: 4, text: "Good work" }])!;
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ stars: 4, text: "Good work" });
  });

  it("keeps what the owner wrote, from whichever copy has it", () => {
    const out = readReviews(raw)!;
    expect(out.map((r) => r.reply)).toEqual(["Susan, we appreciate your kind words.", "Thank you, Maureen.", undefined]);
    expect(readReviews([full("A", "Susan", "2026-10-28T20:08:00Z", "Great.", "Thanks!"), short("A", "Susan", "2026-10-28T20:08:00Z", "Great.")])![0].reply).toBe("Thanks!");
  });

  it("trims a long reply to a size worth keeping, and keeps none for a blank one", () => {
    const [long] = readReviews([full("L", "Lee", "2026-10-28T20:08:00Z", "Ok.", `  ${"word ".repeat(200)}`)])!;
    expect(long.reply!.length).toBe(400);
    const [blank] = readReviews([{ ...full("Z", "Zed", "2026-10-28T20:08:00Z", "Ok."), responseFromOwnerText: "   " }])!;
    expect(blank).toMatchObject({ replied: false });
    expect("reply" in blank).toBe(false);
  });

  it("counts the replies in the stats", () => {
    const out = readReviews(raw)!;
    expect(reviewStats(out, new Date("2026-10-30T12:00:00Z"))).toMatchObject({ count: 3, replied: 2 });
  });
});

