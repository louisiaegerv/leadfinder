/**
 * The newest few Google reviews of a business, kept small: enough to see how recently it has been
 * getting reviews, whether the owner answers them, and whether any recent ones were bad.
 * Only available when a Maps run was launched with reviews turned on.
 */
export type ReviewSample = {
  id: string;
  /** 1 to 5, or null if the actor gave none. */
  stars: number | null;
  /** When it was published, as an ISO date. */
  at: string;
  text: string | null;
  replied: boolean;
};

/** The actor charges $0.25 per 1,000 review records actually returned. */
export const REVIEW_RATE_PER_1000 = 0.25;
export const DEFAULT_MAX_REVIEWS = 5;
export const MAX_REVIEWS_LIMIT = 50;

/** Most we would pay for reviews: every place returning the full number. Billing is for reviews actually returned. */
export const reviewCostUsd = (places: number, perPlace: number) => (places * perPlace * REVIEW_RATE_PER_1000) / 1000;

/** Newest reviews kept per place, whatever the run asked for. */
const KEEP = 10;
const TEXT_MAX = 300;
const DAY = 86_400_000;

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/**
 * The actor's `reviews` array as a sample, newest first. Returns null when the item has no `reviews`
 * field at all (the run did not ask for them), and an empty list when it was asked and the place has none,
 * so "not asked" never looks like "no reviews".
 */
export function readReviews(raw: unknown): ReviewSample[] | null {
  if (!Array.isArray(raw)) return null;
  const seen = new Set<string>();
  const out: ReviewSample[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const when = str(o.publishedAtDate) ?? str(o.publishedAtTimestamp);
    const ms = when ? Date.parse(when) : NaN;
    if (!Number.isFinite(ms)) continue; // "2 months ago" alone can't be dated
    const id = str(o.reviewId) ?? `${ms}:${str(o.reviewerId) ?? str(o.name) ?? out.length}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const stars = Number(o.stars ?? o.rating);
    out.push({
      id,
      stars: Number.isFinite(stars) && stars >= 1 && stars <= 5 ? stars : null,
      at: new Date(ms).toISOString(),
      text: str(o.text)?.slice(0, TEXT_MAX) ?? null,
      replied: !!str(o.responseFromOwnerText),
    });
  }
  return out.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, KEEP);
}

export type ReviewStats = {
  count: number;
  /** Days since the newest sampled review. */
  newestDays: number;
  /** Days since the oldest sampled review. */
  oldestDays: number;
  /** How often they came in while the sample was being collected, or null when the sample is too small to say. */
  perMonth: number | null;
  replied: number;
  /** Reviews of 1 or 2 stars in the last 90 days. */
  lowRecent: number;
};

/** Recency and responsiveness from a sample, as of `now`. Null when there is nothing to go on. */
export function reviewStats(sample: ReviewSample[] | null | undefined, now: Date): ReviewStats | null {
  if (!sample || sample.length === 0) return null;
  const days = sample.map((r) => Math.max(0, Math.floor((now.getTime() - Date.parse(r.at)) / DAY)));
  const newestDays = Math.min(...days);
  const oldestDays = Math.max(...days);
  const span = oldestDays - newestDays;
  return {
    count: sample.length,
    newestDays,
    oldestDays,
    perMonth: sample.length >= 3 && span >= 7 ? Math.round(((sample.length - 1) / (span / 30.4)) * 10) / 10 : null,
    replied: sample.filter((r) => r.replied).length,
    lowRecent: sample.filter((r, i) => r.stars != null && r.stars <= 2 && days[i] <= 90).length,
  };
}

/** "12 days", "3 months", "1 year". */
export function ageLabel(days: number): string {
  if (days < 60) return `${days} ${days === 1 ? "day" : "days"}`;
  if (days < 365) return `${Math.round(days / 30.4)} months`;
  const years = Math.round((days / 365) * 10) / 10;
  return `${years} ${years === 1 ? "year" : "years"}`;
}
