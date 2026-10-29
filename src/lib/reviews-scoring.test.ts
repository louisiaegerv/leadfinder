import { describe, expect, it } from "vitest";
import { buildMapsInput, KEEP_FIELDS } from "./apify";
import { estimateCostUsd } from "./geo";
import { normalizeItem } from "./normalize";
import { emptyPlaybook } from "./playbook";
import type { ReviewSample } from "./reviews";
import { SCORING_VERSION, scorePlace, type ScoreInput } from "./scoring";

const NOW = new Date("2026-10-29T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();
const sample = (ages: number[], over: Partial<ReviewSample> = {}): ReviewSample[] =>
  ages.map((d, i) => ({ id: `r${i}`, stars: 5, at: daysAgo(d), text: null, replied: false, ...over }));

const base: ScoreInput = {
  relevance: "target", areaId: 1, postalCode: "77380", categories: ["Flooring contractor"], domain: "acme.com", website: "https://acme.com",
  phone: "+17135550100", totalScore: 4.6, reviewsCount: 120, photosCount: 30, permanentlyClosed: false, temporarilyClosed: false,
  openingHours: null, bookingLinks: null, facebookState: null,
};
const offers = (p: ScoreInput) => scorePlace(p, emptyPlaybook(), null, NOW).offers;
const say = (p: ScoreInput, o: "review_system" | "db_reactivation") => offers(p)[o].evidence.join(" | ");

describe("review recency in scoring", () => {
  it("changes nothing for a place whose reviews were never sampled, or has none", () => {
    const plain = scorePlace(base, emptyPlaybook(), null, NOW);
    expect(scorePlace({ ...base, reviewSample: null }, emptyPlaybook(), null, NOW)).toEqual(plain);
    expect(scorePlace({ ...base, reviewSample: [] }, emptyPlaybook(), null, NOW)).toEqual(plain);
    expect(SCORING_VERSION).toBeGreaterThanOrEqual(4);
  });

  it("review system: the longer since the newest review, the stronger the signal", () => {
    const score = (age: number) => offers({ ...base, reviewSample: sample([age, age + 20, age + 40]) }).review_system.score;
    const none = offers(base).review_system.score;
    expect(score(10)).toBe(none); // collecting reviews already: no push
    expect(score(60)).toBe(none + 5);
    expect(score(120)).toBe(none + 14);
    expect(score(250)).toBe(none + 22);
  });

  it("says so in plain words, labelling the conclusions as inferences", () => {
    expect(say({ ...base, reviewSample: sample([250, 270, 300]) }, "review_system")).toContain("(inferred) Newest review is 8 months old: new reviews have dried up");
    expect(say({ ...base, reviewSample: sample([120, 130, 140]) }, "review_system")).toContain("(inferred) Newest review is 4 months old: reviews are slowing down");
    expect(say({ ...base, reviewSample: sample([60, 70, 80]) }, "review_system")).toContain("Newest review is 2 months old");
    expect(say({ ...base, reviewSample: sample([10, 20, 30]) }, "review_system")).toContain("Newest review is only 10 days old: already collecting reviews");
  });

  it("notes whether the owner replies and any recent bad reviews, without changing the score", () => {
    const quiet = { ...base, reviewSample: sample([10, 20, 30, 40]) };
    expect(say(quiet, "review_system")).toContain("Has not replied to any of the last 4 reviews");
    expect(say({ ...base, reviewSample: sample([10, 20, 30, 40]).map((r, i) => ({ ...r, replied: i < 2 })) }, "review_system")).toContain("Replied to 2 of the last 4 reviews");
    const bad = { ...base, reviewSample: sample([10, 20, 30], { stars: 1 }) };
    expect(say(bad, "review_system")).toContain("3 low-star reviews in the last 90 days");
    expect(offers(bad).review_system.score).toBe(offers(quiet).review_system.score);
  });

  it("reactivation: a big review base that has gone quiet is the target; a busy one or a small one is not", () => {
    const flat = offers(base).db_reactivation.score;
    const quiet = offers({ ...base, reviewSample: sample([200, 220, 240]) });
    expect(quiet.db_reactivation.score).toBe(flat + 10);
    expect(quiet.db_reactivation.evidence.join(" ")).toContain("Reviews have slowed (newest is 7 months old) after 120 in total");
    expect(offers({ ...base, reviewSample: sample([20, 30, 40]) }).db_reactivation.score).toBe(flat);
    expect(offers({ ...base, reviewsCount: 20, reviewSample: sample([200, 220, 240]) }).db_reactivation.score).toBe(offers({ ...base, reviewsCount: 20 }).db_reactivation.score);
  });

  it("depends on the date it is scored on, so the same sample reads older later", () => {
    const s = sample([100]);
    const later = new Date(NOW.getTime() + 100 * 86_400_000);
    expect(scorePlace({ ...base, reviewSample: s }, emptyPlaybook(), null, NOW).offers.review_system.score).toBeLessThan(
      scorePlace({ ...base, reviewSample: s }, emptyPlaybook(), null, later).offers.review_system.score,
    );
  });
});

describe("asking the actor for reviews", () => {
  const input = {
    queries: ["epoxy flooring"], shape: { shape: "radius" as const, centerLat: 30, centerLng: -95, radiusKm: 10 },
    gridSpacingKm: 8, num: 100, skipClosedPlaces: true, gl: "us", hl: "en",
  };

  it("sends reviews, the maximum and newest-first, and keeps them in the trimmed field list", () => {
    const i = buildMapsInput({ ...input, reviews: true, maxReviews: 5 });
    expect(i).toMatchObject({ reviews: true, maxReviews: 5, reviewsSort: "newest" });
    expect(String(i.fields).split(",")).toContain("reviews");
  });

  it("sends none of it when reviews are off, so an ordinary run costs what it did", () => {
    const i = buildMapsInput({ ...input, reviews: false });
    expect(i).not.toHaveProperty("reviews");
    expect(i).not.toHaveProperty("maxReviews");
    expect(i).not.toHaveProperty("reviewsSort");
    expect(i.fields).toBe(KEEP_FIELDS.join(","));
    expect(buildMapsInput(input)).not.toHaveProperty("reviews");
  });

  it("adds $0.25 per 1,000 reviews to the estimate, as an upper bound", () => {
    const without = estimateCostUsd(1000, "starter");
    expect(estimateCostUsd(1000, "starter", 5)).toBeCloseTo(without + 1.25, 6);
    expect(estimateCostUsd(1000, "starter", 0)).toBe(without);
  });
});

describe("reading reviews from an actor item", () => {
  const item = (extra: Record<string, unknown>) => ({
    title: "Acme", placeId: "p1", cid: "1", categories: ["Flooring contractor"], location: { lat: 30, lng: -95 }, query: "q", ...extra,
  });
  const review = { reviewId: "a", stars: 5, text: "Great floor", publishedAtDate: "2026-08-11T00:55:19Z", responseFromOwnerText: "Thanks!" };

  it("keeps a sample when the item has reviews, and null when the run did not ask for them", () => {
    expect(normalizeItem(item({ reviews: [review] }))!.place.reviewSample).toEqual([
      { id: "a", stars: 5, at: "2026-08-11T00:55:19.000Z", text: "Great floor", replied: true },
    ]);
    expect(normalizeItem(item({}))!.place.reviewSample).toBeNull();
    expect(normalizeItem(item({ reviews: [] }))!.place.reviewSample).toEqual([]);
  });
});
