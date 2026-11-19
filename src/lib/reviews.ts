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
  /** What the owner wrote back. Absent on samples saved before replies were kept, and when there is no reply. */
  reply?: string;
};

/** The actor charges $0.25 per 1,000 review records actually returned. */
export const REVIEW_RATE_PER_1000 = 0.25;
export const DEFAULT_MAX_REVIEWS = 5;
export const MAX_REVIEWS_LIMIT = 50;

/** Most we would pay for reviews: every place returning the full number. Billing is for reviews actually returned. */
export const reviewCostUsd = (places: number, perPlace: number) => (places * perPlace * REVIEW_RATE_PER_1000) / 1000;

const shortDate = (d: Date | string) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/** What fetching one business's reviews will do, in plain sentences, for the confirmation shown before it is paid for. */
export function reviewFetchLines(o: { sample: ReviewSample[] | null; sampledAt: Date | null; maxReviews: number }): string[] {
  const { sample, sampledAt, maxReviews } = o;
  const had =
    sample === null
      ? "No reviews have been fetched for this business yet."
      : sample.length === 0
        ? `Last fetched${sampledAt ? ` on ${shortDate(sampledAt)}` : ""}: it had no reviews.`
        : `Replaces the ${sample.length} review${sample.length === 1 ? "" : "s"} saved${sampledAt ? ` on ${shortDate(sampledAt)}` : ""} (the newest is from ${shortDate(sample[0].at)}).`;
  return [
    `Fetches the newest ${maxReviews} Google reviews of this business, through Apify.`,
    had,
    "Also refreshes its star rating and review count, and re-scores it in every niche that tracks it.",
    "Runs in the background and usually takes under a minute. You can keep working.",
  ];
}

/** Newest reviews kept per place, whatever the run asked for. */
const KEEP = 10;
const TEXT_MAX = 300;
const REPLY_MAX = 400;
const DAY = 86_400_000;

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/**
 * The actor's `reviews` array as a sample, newest first. Returns null when the item has no `reviews`
 * field at all (the run did not ask for them), and an empty list when it was asked and the place has none,
 * so "not asked" never looks like "no reviews".
 */
export function readReviews(raw: unknown): ReviewSample[] | null {
  if (!Array.isArray(raw)) return null;
  // The actor can return one review twice, in two shapes: a short record, and a fuller one (with the owner's reply) that
  // shares its reviewId. Keeping only the first loses the reply, so copies are merged, and a reply on either one counts.
  const byId = new Map<string, ReviewSample>();
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const when = str(o.publishedAtDate) ?? str(o.publishedAtTimestamp);
    const ms = when ? Date.parse(when) : NaN;
    if (!Number.isFinite(ms)) continue; // "2 months ago" alone can't be dated
    const id = str(o.reviewId) ?? `${ms}:${str(o.reviewerId) ?? str(o.name) ?? str(o.author) ?? ""}`;
    const stars = Number(o.stars ?? o.rating);
    const reply = str(o.responseFromOwnerText)?.slice(0, REPLY_MAX);
    const next: ReviewSample = {
      id,
      stars: Number.isFinite(stars) && stars >= 1 && stars <= 5 ? stars : null,
      at: new Date(ms).toISOString(),
      text: str(o.text)?.slice(0, TEXT_MAX) ?? null,
      replied: !!reply,
      ...(reply ? { reply } : {}),
    };
    const prev = byId.get(id);
    byId.set(
      id,
      prev
        ? { ...prev, stars: prev.stars ?? next.stars, text: prev.text ?? next.text, replied: prev.replied || next.replied, ...(prev.reply ?? next.reply ? { reply: prev.reply ?? next.reply } : {}) }
        : next,
    );
  }
  return [...byId.values()].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, KEEP);
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
