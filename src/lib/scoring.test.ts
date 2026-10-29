import { describe, expect, it } from "vitest";
import { buildPeerLookup, hoursSignals, parseDayHours, scorePlace, tierOf, websiteKind, type ScoreInput } from "./scoring";
import { emptyPlaybook } from "./playbook";
import { PRESETS } from "./presets";

const pb = PRESETS.find((p) => p.key === "flooring-concrete")!.playbook;

const base = (over: Partial<ScoreInput> = {}): ScoreInput => ({
  relevance: "target",
  areaId: 1,
  postalCode: "77380",
  categories: ["Flooring contractor", "Concrete contractor"],
  domain: "acmefloors.com",
  website: "https://acmefloors.com",
  phone: "+17135550100",
  totalScore: 4.4,
  reviewsCount: 80,
  photosCount: 30,
  permanentlyClosed: false,
  temporarilyClosed: false,
  openingHours: {
    Monday: "8 AM–5 PM", Tuesday: "8 AM–5 PM", Wednesday: "8 AM–5 PM", Thursday: "8 AM–5 PM",
    Friday: "8 AM–5 PM", Saturday: "Closed", Sunday: "Closed",
  },
  bookingLinks: null,
  facebookState: null,
  ...over,
});

describe("parseDayHours", () => {
  it("parses ranges, closed and 24h", () => {
    expect(parseDayHours("8 AM–5 PM")).toMatchObject({ openMin: 480, closeMin: 1020 });
    expect(parseDayHours("11:30 AM–12 AM")).toMatchObject({ openMin: 690, closeMin: 1440 });
    expect(parseDayHours("9–5 PM")).toMatchObject({ openMin: 540, closeMin: 1020 });
    expect(parseDayHours("Closed")).toMatchObject({ closed: true });
    expect(parseDayHours("Open 24 hours")).toMatchObject({ open24: true });
    expect(parseDayHours("by appointment")).toBeNull();
  });
  it("summarises weekday close and Saturday", () => {
    const h = hoursSignals(base().openingHours);
    expect(h).toMatchObject({ listed: true, weekdayCloseMin: 1020, closedSaturday: true });
    expect(hoursSignals(null)).toEqual({ listed: false });
  });
});

describe("websiteKind", () => {
  it("classifies what the listing links to", () => {
    expect(websiteKind(null, null)).toBe("none");
    expect(websiteKind("facebook.com", "https://facebook.com/x")).toBe("social");
    expect(websiteKind("foo.wixsite.com", "x")).toBe("builder");
    expect(websiteKind("yelp.com", "x")).toBe("directory");
    expect(websiteKind("acmefloors.com", "x")).toBe("own");
  });
});

describe("peer benchmarks", () => {
  const peers = (n: number, reviews: number) =>
    Array.from({ length: n }, () => ({ areaId: 1, postalCode: "77380", categories: ["Flooring contractor"], reviewsCount: reviews, relevance: "target" as const }));

  it("uses ZIP+category when it has 5+ peers, else widens", () => {
    const lookup = buildPeerLookup([...peers(5, 100), ...peers(10, 40).map((r) => ({ ...r, postalCode: "77381" }))]);
    expect(lookup({ areaId: 1, postalCode: "77380", categories: ["Flooring contractor"] })).toMatchObject({ medianReviews: 100, count: 5 });
    // 77382 has no peers of its own, so it falls back to the area+category group.
    const wide = lookup({ areaId: 1, postalCode: "77382", categories: ["Flooring contractor"] })!;
    expect(wide.count).toBe(15);
    expect(wide.scope).toMatch(/area/);
  });
  it("returns null with fewer than 5 peers anywhere, and ignores noise rows", () => {
    expect(buildPeerLookup(peers(4, 50))({ areaId: 1, postalCode: null, categories: ["x"] })).toBeNull();
    const noise = peers(10, 500).map((r) => ({ ...r, relevance: "noise" as const }));
    expect(buildPeerLookup(noise)({ areaId: 1, postalCode: "77380", categories: ["Flooring contractor"] })).toBeNull();
  });
});

describe("scorePlace: offer fit", () => {
  const peers = { medianReviews: 120, count: 20, scope: "area" };

  it("no website leads with the website offer and explains why", () => {
    const r = scorePlace(base({ domain: null, website: null, reviewsCount: 30 }), pb, peers);
    expect(r.offers.website.score).toBeGreaterThanOrEqual(55);
    expect(r.leadOffer).toBe("website");
    expect(r.offers.website.evidence.join(" ")).toMatch(/No website/);
  });

  it("labels guesses as inferences and facts as facts", () => {
    const r = scorePlace(base({ domain: "foo.wixsite.com" }), pb, peers);
    expect(r.offers.website.evidence.some((e) => e.startsWith("(inferred)"))).toBe(true);
    expect(r.offers.review_system.evidence.some((e) => /reviews vs a median/.test(e))).toBe(false); // 80 vs 120 is not far enough below
  });

  it("far fewer reviews than local peers boosts the review system", () => {
    const low = scorePlace(base({ reviewsCount: 30 }), pb, peers); // 30 < 0.4 x 120
    const near = scorePlace(base({ reviewsCount: 110 }), pb, peers);
    expect(low.offers.review_system.score).toBeGreaterThan(near.offers.review_system.score);
    expect(low.offers.review_system.evidence.join(" ")).toMatch(/vs a median of 120/);
  });

  it("Facebook state moves the offers the way you described", () => {
    const none = scorePlace(base(), pb, peers);
    const noAds = scorePlace(base({ facebookState: "page_no_ads" }), pb, peers);
    const ads = scorePlace(base({ facebookState: "active_ads" }), pb, peers);
    expect(noAds.offers.facebook_ads.score).toBeGreaterThan(none.offers.facebook_ads.score);
    expect(ads.offers.speed_to_lead.score).toBeGreaterThan(none.offers.speed_to_lead.score);
    expect(ads.offers.facebook_ads.score).toBeLessThan(none.offers.facebook_ads.score);
    expect(none.offers.facebook_ads.evidence.join(" ")).toMatch(/Pending: Facebook/);
  });

  it("speed to lead picks up hours gaps and a missing booking link", () => {
    const r = scorePlace(base(), pb, peers);
    const ev = r.offers.speed_to_lead.evidence.join(" | ");
    expect(ev).toMatch(/Closes at 5 PM/);
    expect(ev).toMatch(/Closed Saturday/);
    expect(ev).toMatch(/No booking link/);
  });

  it("applies the niche's offer weights", () => {
    const heavy = { ...pb, offerWeights: { ...pb.offerWeights, db_reactivation: 2 } };
    const a = scorePlace(base({ reviewsCount: 200 }), pb, peers).offers.db_reactivation.score;
    const b = scorePlace(base({ reviewsCount: 200 }), heavy, peers).offers.db_reactivation.score;
    expect(b).toBeGreaterThan(a);
    expect(b).toBeLessThanOrEqual(100);
  });
});

describe("scorePlace: lead offer is about this business, not the trade", () => {
  const peers = { medianReviews: 120, count: 20, scope: "area" };

  it("the same trade profile does not make one offer lead for everyone", () => {
    const noSite = scorePlace(base({ domain: null, website: null, reviewsCount: 20 }), pb, peers);
    const bigBase = scorePlace(base({ reviewsCount: 320, totalScore: 4.8, bookingLinks: ["https://book"], openingHours: { Monday: "Open 24 hours" } }), pb, peers);
    const fewReviews = scorePlace(base({ reviewsCount: 18, totalScore: 4.3, bookingLinks: ["https://book"], openingHours: { Monday: "Open 24 hours" } }), pb, peers);
    const leads = new Set([noSite.leadOffer, bigBase.leadOffer, fewReviews.leadOffer]);
    expect(noSite.leadOffer).toBe("website");
    expect(bigBase.leadOffer).toBe("db_reactivation");
    expect(leads.size).toBeGreaterThanOrEqual(2);
  });

  it("trade-level points still show in the displayed score and evidence", () => {
    const r = scorePlace(base(), pb, peers);
    expect(r.offers.facebook_ads.evidence.join(" ")).toMatch(/High-ticket trade/);
    expect(r.offers.facebook_ads.score).toBeGreaterThan(30);
  });
});

describe("scorePlace: overall score", () => {
  const peers = { medianReviews: 120, count: 20, scope: "area" };

  it("established with fixable gaps beats the weakest business", () => {
    const established = scorePlace(
      base({ reviewsCount: 140, totalScore: 4.6, domain: "x.wixsite.com", photosCount: 6, bookingLinks: null }),
      pb,
      peers,
    );
    const weakest = scorePlace(
      base({ reviewsCount: 1, totalScore: 2.5, phone: null, domain: null, website: null, openingHours: null, photosCount: 1 }),
      pb,
      peers,
    );
    expect(established.score).toBeGreaterThan(weakest.score + 25);
    expect(tierOf(established.score)).toMatch(/A|B/);
  });

  it("gates by relevance and closure", () => {
    const target = scorePlace(base(), pb, null).score;
    expect(scorePlace(base({ relevance: "noise" }), pb, null).score).toBe(0);
    expect(Math.abs(scorePlace(base({ relevance: "adjacent" }), pb, null).score - target / 2)).toBeLessThanOrEqual(1);
    expect(scorePlace(base({ permanentlyClosed: true }), pb, null).score).toBe(0);
    expect(scorePlace(base({ relevance: "noise" }), pb, null).leadOffer).toBeNull();
  });

  it("has no lead offer when nothing clears the bar", () => {
    const r = scorePlace(
      base({ phone: null, domain: "acme-plumbing.com", reviewsCount: 0, totalScore: null, openingHours: { Monday: "Open 24 hours" }, bookingLinks: ["https://b"] }),
      emptyPlaybook(),
      null,
    );
    expect(r.leadOffer).toBeNull();
    expect(r.runnerUpOffer).toBeNull();
  });
});
