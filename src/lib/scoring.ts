import type { FacebookState, OfferKey } from "./offers";
import { OFFERS } from "./offers";
import type { Playbook } from "./playbook";
import { ageLabel, reviewStats, type ReviewSample, type ReviewStats } from "./reviews";
import type { SiteSignals } from "./site-types";

/**
 * Offer-fit engine. A fixed model (no scoring editor): every place gets a fit
 * score per offer with a visible evidence list, plus an overall prospect score
 * = fit gate x (capacity + gaps + reachability). Evidence lines that are
 * guesses rather than facts from the listing start with "(inferred)".
 */

export type Relevance = "target" | "adjacent" | "noise" | null;

export type ScoreInput = {
  relevance: Relevance;
  areaId: number | null;
  postalCode: string | null;
  categories: string[];
  domain: string | null;
  website: string | null;
  phone: string | null;
  totalScore: number | null;
  reviewsCount: number | null;
  photosCount: number | null;
  permanentlyClosed: boolean | null;
  temporarilyClosed: boolean | null;
  openingHours: Record<string, string> | null;
  bookingLinks: string[] | null;
  facebookState: FacebookState | null;
  /** From a website scan, when one has been run. Absent means "not scanned", never "nothing found". */
  site?: SiteSignals | null;
  /** A Facebook page we know of, from the business's website or a search. */
  facebookPageUrl?: string | null;
  /** The newest few reviews, when a run asked for them. Absent means "not sampled", never "no reviews". */
  reviewSample?: ReviewSample[] | null;
};

export type OfferScore = { score: number; evidence: string[] };

export type ScoreResult = {
  score: number;
  breakdown: { fit: number; capacity: number; gaps: number; reachability: number; notes: string[] };
  offers: Record<OfferKey, OfferScore>;
  leadOffer: OfferKey | null;
  runnerUpOffer: OfferKey | null;
};

// ---------- website kind ----------

const SOCIAL = ["facebook.com", "fb.com", "instagram.com", "linktr.ee", "tiktok.com", "x.com", "twitter.com"];
const BUILDERS = ["business.site", "wixsite.com", "weebly.com", "godaddysites.com", "square.site", "wordpress.com", "blogspot.com", "site123.me", "webs.com", "carrd.co", "mystrikingly.com"];
const DIRECTORIES = ["yelp.com", "angi.com", "thumbtack.com", "homeadvisor.com", "nextdoor.com", "bbb.org", "yellowpages.com", "mapquest.com"];

export type WebsiteKind = "none" | "social" | "builder" | "directory" | "own";

const hostMatches = (host: string, list: string[]) => list.some((d) => host === d || host.endsWith(`.${d}`));

export function websiteKind(domain: string | null, website: string | null): WebsiteKind {
  const host = (domain ?? "").toLowerCase().replace(/^www\./, "");
  if (!host && !website) return "none";
  if (!host) return "own";
  if (hostMatches(host, SOCIAL)) return "social";
  if (hostMatches(host, BUILDERS)) return "builder";
  if (hostMatches(host, DIRECTORIES)) return "directory";
  return "own";
}

// ---------- opening hours ----------

export type DayHours = { closed: boolean; open24: boolean; openMin: number | null; closeMin: number | null };

const TIME = /(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i;

function toMin(h: string, m: string | undefined, mer: string | undefined): number {
  let hour = Number(h) % 12;
  if (mer?.toUpperCase() === "PM") hour += 12;
  if (!mer && Number(h) === 12) hour = 12;
  return hour * 60 + Number(m ?? 0);
}

/** Parses Google's "8 AM–5 PM", "Closed", "Open 24 hours". Unparseable text returns null. */
export function parseDayHours(text: string): DayHours | null {
  const t = text.trim();
  if (/^closed$/i.test(t)) return { closed: true, open24: false, openMin: null, closeMin: null };
  if (/24\s*hours/i.test(t)) return { closed: false, open24: true, openMin: 0, closeMin: 1440 };
  // First range only (split shifts are rare for the trades we target).
  const [range] = t.split(",");
  const parts = range.split(/\s*(?:–|—|-|to)\s*/i);
  if (parts.length < 2) return null;
  const a = parts[0].match(TIME);
  const b = parts[1].match(TIME);
  if (!a || !b) return null;
  const closeMer = b[3];
  let openMin = toMin(a[1], a[2], a[3] ?? closeMer);
  let closeMin = toMin(b[1], b[2], closeMer);
  // "9–5 PM": the open time borrowed PM and landed after closing, so it is really AM.
  if (!a[3] && openMin > closeMin && openMin >= 720) openMin -= 720;
  if (closeMin <= openMin) closeMin += 1440; // closes after midnight
  return { closed: false, open24: false, openMin, closeMin };
}

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

export function hoursSignals(hours: Record<string, string> | null) {
  if (!hours || Object.keys(hours).length === 0) return { listed: false as const };
  const parsed = Object.fromEntries(
    Object.entries(hours).map(([d, v]) => [d, parseDayHours(v)] as const),
  );
  const weekdayCloses = WEEKDAYS.map((d) => parsed[d]).filter((d): d is DayHours => !!d && !d.closed && !d.open24 && d.closeMin != null);
  const medianClose = weekdayCloses.length ? median(weekdayCloses.map((d) => d.closeMin as number)) : null;
  return {
    listed: true as const,
    open24: Object.values(parsed).some((d) => d?.open24),
    weekdayCloseMin: medianClose,
    closedSaturday: parsed.Saturday?.closed === true,
    closedSunday: parsed.Sunday?.closed === true,
  };
}

// ---------- peers ----------

export function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export type Peers = { medianReviews: number; count: number; scope: string };
export type PeerLookup = (p: Pick<ScoreInput, "areaId" | "postalCode" | "categories">) => Peers | null;

const MIN_PEERS = 5;

/**
 * Benchmarks come from the niche's own on-target places: ZIP + category first,
 * then area + category, then area, then the whole niche. A scope needs at least
 * 5 peers or we widen it, so tiny groups never set the bar.
 */
export function buildPeerLookup(
  rows: Pick<ScoreInput, "areaId" | "postalCode" | "categories" | "reviewsCount" | "relevance">[],
): PeerLookup {
  const groups = new Map<string, number[]>();
  const add = (key: string, n: number) => {
    const g = groups.get(key);
    if (g) g.push(n);
    else groups.set(key, [n]);
  };
  for (const r of rows) {
    if (r.reviewsCount == null || (r.relevance !== "target" && r.relevance !== null)) continue;
    const cat = r.categories[0] ?? "";
    if (r.postalCode) add(`zip|${r.postalCode}|${cat}`, r.reviewsCount);
    add(`area|${r.areaId}|${cat}`, r.reviewsCount);
    add(`areaall|${r.areaId}`, r.reviewsCount);
    add("niche", r.reviewsCount);
  }
  const pick = (key: string, scope: string): Peers | null => {
    const g = groups.get(key);
    return g && g.length >= MIN_PEERS ? { medianReviews: median(g), count: g.length, scope } : null;
  };
  return (p) => {
    const cat = p.categories[0] ?? "";
    return (
      (p.postalCode ? pick(`zip|${p.postalCode}|${cat}`, `ZIP ${p.postalCode} ${cat}`) : null) ??
      pick(`area|${p.areaId}|${cat}`, `area ${cat}`) ??
      pick(`areaall|${p.areaId}`, "area") ??
      pick("niche", "niche")
    );
  };
}

// ---------- offer scoring ----------

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const INFER = "(inferred) ";

class Tally {
  score = 0;
  /** Points that come from the trade profile: identical for every business in the niche. */
  priorPoints = 0;
  evidence: string[] = [];
  add(points: number, text: string) {
    this.score += points;
    this.evidence.push(text);
  }
  prior(points: number, text: string) {
    this.add(points, text);
    this.priorPoints += points;
  }
  note(text: string) {
    this.evidence.push(text);
  }
}

const fmtTime = (min: number) => {
  const m = min % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${((h + 11) % 12) + 1}${mm ? `:${String(mm).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
};

type Ctx = { p: ScoreInput; pb: Playbook; peers: Peers | null; site: WebsiteKind; hours: ReturnType<typeof hoursSignals>; reviews: ReviewStats | null };

/** A scan only says something about the page when it could actually read it (or proved the site is gone). */
const readable = (p: ScoreInput) => p.site?.outcome === "ok";
const DIY_BUILDERS = new Set(["wix", "godaddy", "weebly"]);
const STALE_YEARS = 3;

function reviewSystem({ p, pb, peers, reviews: recent }: Ctx): RawOffer {
  const t = new Tally();
  const reviews = p.reviewsCount ?? 0;
  if (peers && peers.medianReviews >= 10 && p.reviewsCount != null) {
    const ratio = reviews / peers.medianReviews;
    if (ratio < 0.4) t.add(35, `${reviews} reviews vs a median of ${Math.round(peers.medianReviews)} for ${peers.count} local peers (${peers.scope})`);
    else if (ratio < 0.7) t.add(20, `${reviews} reviews, below the peer median of ${Math.round(peers.medianReviews)} (${peers.scope})`);
  }
  if (p.totalScore != null) {
    // Baseline-sized points on purpose: nearly everyone earns these, so the
    // evidence-specific gap (far fewer reviews than peers) must be what separates leads.
    if (p.totalScore >= 3.8 && p.totalScore < 4.6) t.add(12, `${p.totalScore}★ leaves room to lift the rating`);
    else if (p.totalScore >= 3.0 && p.totalScore < 3.8) t.add(12, `${p.totalScore}★ is dragging on conversions`);
    else if (p.totalScore >= 4.6) t.add(4, `${p.totalScore}★ already strong`);
  }
  if (reviews >= 25) t.add(10, `${reviews} reviews means a real customer base to ask`);
  else if (reviews >= 10) t.add(5, `${reviews} reviews so far`);
  if (recent) {
    // How long since the last review is the clearest sign the reviews have stopped coming in.
    const age = ageLabel(recent.newestDays);
    if (recent.newestDays >= 180) t.add(22, `${INFER}Newest review is ${age} old: new reviews have dried up`);
    else if (recent.newestDays >= 90) t.add(14, `${INFER}Newest review is ${age} old: reviews are slowing down`);
    else if (recent.newestDays >= 45) t.add(5, `Newest review is ${age} old`);
    else t.note(`Newest review is only ${age} old: already collecting reviews`);
    if (recent.count >= 3) t.note(recent.replied === 0 ? `Has not replied to any of the last ${recent.count} reviews` : `Replied to ${recent.replied} of the last ${recent.count} reviews`);
    if (recent.lowRecent > 0) t.note(`${recent.lowRecent} low-star review${recent.lowRecent === 1 ? "" : "s"} in the last 90 days`);
  }
  if (pb.trade.ticketSize === "high") t.prior(5, "High-ticket trade: reviews drive trust");
  else if (pb.trade.ticketSize === "medium") t.prior(3, "Mid-ticket trade: reviews help close");
  return { score: t.score, evidence: t.evidence, prior: t.priorPoints };
}

function reactivation({ p, pb, reviews: recent }: Ctx): RawOffer {
  const t = new Tally();
  const n = p.reviewsCount ?? 0;
  const base = n >= 300 ? 50 : n >= 150 ? 40 : n >= 60 ? 30 : n >= 25 ? 18 : n >= 10 ? 8 : 0;
  if (base) t.add(base, `${INFER}${n} Google reviews suggests a large past-customer base (reviews are only a fraction of customers)`);
  // A big base of past customers whose reviews have gone quiet is the classic reactivation target.
  if (recent && n >= 40 && recent.newestDays >= 150)
    t.add(10, `${INFER}Reviews have slowed (newest is ${ageLabel(recent.newestDays)} old) after ${n} in total: past customers are worth re-engaging`);
  if (pb.trade.ticketSize === "high") t.prior(15, "High-ticket trade: each reactivated customer is worth a lot");
  else if (pb.trade.ticketSize === "medium") t.prior(8, "Mid-ticket trade");
  if (pb.trade.salesCycle !== "days") t.prior(5, "Longer sales cycle: past quotes are worth revisiting");
  if (pb.trade.seasonality === "seasonal") t.prior(10, "Seasonal trade: reactivate before the season");
  t.note("Pending: oldest review date needs the reviews add-on");
  return { score: t.score, evidence: t.evidence, prior: t.priorPoints };
}

function speedToLead({ p, pb, hours }: Ctx): RawOffer {
  const t = new Tally();
  if (!p.phone) t.add(-20, "No public phone number to build on");
  if (!hours.listed) t.add(15, `${INFER}No business hours listed, so calls likely go unanswered`);
  else if (!hours.open24) {
    if (hours.weekdayCloseMin != null && hours.weekdayCloseMin <= 17 * 60)
      t.add(12, `${INFER}Closes at ${fmtTime(hours.weekdayCloseMin)} on weekdays, so after-hours calls likely hit voicemail`);
    if (hours.closedSaturday) t.add(8, `${INFER}Closed Saturday, a common time for homeowners to enquire`);
  }
  if (!p.bookingLinks?.length) t.add(12, "No booking link on the Maps listing");
  if (pb.trade.salesCycle === "days") t.prior(15, "Fast sales cycle: the first responder wins the job");
  else if (pb.trade.salesCycle === "weeks") t.prior(8, "Homeowners shop around: speed matters");
  if (pb.trade.ticketSize === "high") t.prior(8, "High-ticket trade: a missed lead is expensive");
  if ((p.reviewsCount ?? 0) >= 15) t.add(10, `${INFER}${p.reviewsCount} reviews suggests steady inbound demand`);
  if (p.facebookState === "active_ads") t.add(25, "Running Facebook ads: leads are already arriving");
  else if (p.facebookState === "active_ads_weak_landing") t.add(20, "Running Facebook ads to a weak landing page");
  if (readable(p) && p.site) {
    if (!p.site.chat && !p.site.hasForm) t.add(10, "No contact form or chat found on the site's main pages: a visitor can only phone");
    if (p.site.chat) t.add(-5, `Already has a chat widget (${p.site.chat})`);
  }
  return { score: t.score, evidence: t.evidence, prior: t.priorPoints };
}

function facebookAds({ p, pb, site }: Ctx): RawOffer {
  const t = new Tally();
  if (pb.trade.channelFit === "meta") t.prior(15, "Trade suits Meta (people do not search for this until prompted)");
  else if (pb.trade.channelFit === "both") t.prior(8, "Trade works on both Meta and search");
  if (pb.trade.ticketSize === "high") t.prior(15, "High-ticket trade supports paid-ad cost per lead");
  else if (pb.trade.ticketSize === "medium") t.prior(8, "Mid-ticket trade");
  if ((p.reviewsCount ?? 0) >= 20 && (p.totalScore ?? 0) >= 4.3)
    t.add(15, `${p.reviewsCount} reviews at ${p.totalScore}★ gives ads social proof`);
  if (site === "own") t.add(8, "Has a real website to send ad traffic to");
  if (site === "social" && p.domain?.includes("facebook"))
    t.add(10, `${INFER}Uses Facebook as its website, so it is active on the platform`);
  if (pb.trade.seasonality === "seasonal") t.prior(5, "Seasonal trade: ads can time demand");
  if (readable(p) && p.site) {
    if (p.site.fbPixel) t.add(6, `${INFER}Facebook Pixel on the site: they track Facebook traffic, and may have run ads`);
  }
  if ((p.facebookPageUrl || p.site?.facebookUrl) && !p.facebookState) t.add(3, "Has a Facebook page, so it is active on the platform");
  switch (p.facebookState) {
    case "page_no_ads": t.add(35, "Has a Facebook page but no active ads"); break;
    case "active_ads": t.add(-15, "Already running Facebook ads"); break;
    case "active_ads_weak_landing": t.add(5, "Running ads but the landing page is weak"); break;
    case "no_page": t.add(5, "No Facebook page found: would need setting up first"); break;
    default: t.note("Pending: Facebook page and Ad Library check not run yet");
  }
  return { score: t.score, evidence: t.evidence, prior: t.priorPoints };
}

function website({ p, pb, site }: Ctx): RawOffer {
  const t = new Tally();
  if (site === "none") t.add(55, "No website on the Maps listing");
  else if (site === "social") t.add(45, `${INFER}Uses ${p.domain} as a website`);
  else if (site === "builder") t.add(40, `${INFER}Free site-builder domain (${p.domain})`);
  else if (site === "directory") t.add(40, `${INFER}Lists a directory page (${p.domain}) instead of its own site`);
  else t.note(`Has its own website (${p.domain})`);
  if (p.site?.outcome === "dead") t.add(40, `${INFER}The website did not load when we checked (domain not found or page gone)`);
  if (readable(p) && p.site && site === "own") {
    const year = new Date().getFullYear();
    if (!p.site.viewport) t.add(15, "No mobile viewport tag: the site is probably not mobile-friendly");
    if (p.site.copyrightYear && p.site.copyrightYear <= year - STALE_YEARS) t.add(10, `${INFER}Footer says © ${p.site.copyrightYear}, so the site may not be maintained`);
    if (!p.site.hasForm && !p.site.hasBooking) t.add(6, "No quote or contact form found on the site's main pages");
    if (p.site.builder && DIY_BUILDERS.has(p.site.builder)) t.add(5, `${INFER}Built on ${p.site.builder} (a do-it-yourself builder)`);
  }
  if (site !== "own") {
    if (p.facebookState === "no_page") t.add(20, "No Facebook page either: no web presence beyond Maps");
    if ((p.reviewsCount ?? 0) >= 25) t.add(15, `${p.reviewsCount} reviews: worth building a site for`);
    else if ((p.reviewsCount ?? 0) >= 10) t.add(8, `${p.reviewsCount} reviews so far`);
    if (pb.trade.ticketSize === "high") t.prior(10, "High-ticket trade: buyers expect to vet a site");
  }
  return { score: t.score, evidence: t.evidence, prior: t.priorPoints };
}

type RawOffer = OfferScore & { prior: number };

const SCORERS: Record<OfferKey, (c: Ctx) => RawOffer> = {
  facebook_ads: facebookAds,
  speed_to_lead: speedToLead,
  db_reactivation: reactivation,
  review_system: reviewSystem,
  website,
};

// Generic trade defaults alone score ~24, so a lead offer needs real evidence beyond that.
const LEAD_MIN = 30;
const PRIOR_SHARE = 0.4;

/** Bump when the scoring rules change; stored scores are recomputed once on the next page load. */
export const SCORING_VERSION = 5;

/** `now` matters: review recency ("4 months since the last review") changes as time passes. */
export function scorePlace(p: ScoreInput, pb: Playbook, peers: Peers | null, now: Date = new Date()): ScoreResult {
  const site = websiteKind(p.domain, p.website);
  const hours = hoursSignals(p.openingHours);
  const ctx: Ctx = { p, pb, peers, site, hours, reviews: reviewStats(p.reviewSample, now) };

  const offers = {} as Record<OfferKey, OfferScore>;
  // What we rank by: evidence about THIS business counts in full, trade-profile points
  // (identical for everyone in the niche) count at PRIOR_SHARE, so they break ties
  // instead of making the same offer "lead" for every prospect.
  const rank = {} as Record<OfferKey, number>;
  for (const o of OFFERS) {
    const raw = SCORERS[o](ctx);
    const weight = pb.offerWeights[o] ?? 1;
    const score = Math.round(clamp(raw.score * weight));
    offers[o] = {
      score,
      evidence: weight !== 1 ? [...raw.evidence, `Niche weight x${weight}`] : raw.evidence,
    };
    rank[o] = (raw.score - raw.prior + PRIOR_SHARE * raw.prior) * weight;
  }

  const notes: string[] = [];
  const closed = p.permanentlyClosed === true || p.temporarilyClosed === true;
  const fit = closed ? 0 : p.relevance === "target" ? 1 : p.relevance === "adjacent" ? 0.5 : p.relevance === null ? 0.6 : 0;
  if (closed) notes.push("Marked closed on Google");
  else if (p.relevance === "noise") notes.push("Not a target for this niche");
  else if (p.relevance === "adjacent") notes.push("Adjacent business: scored at half");
  else if (p.relevance === null) notes.push("Relevance not decided yet (gray zone): scored at 60%");

  // Capacity: can they afford and sustain a retainer?
  const reviews = p.reviewsCount ?? 0;
  let capacity = 25 * Math.min(1, Math.log10(1 + reviews) / Math.log10(201));
  if ((p.totalScore ?? 0) >= 4.5) capacity += 8;
  else if ((p.totalScore ?? 0) >= 4.0) capacity += 6;
  if (site === "own") capacity += 3;
  if (hours.listed) capacity += 2;
  if (p.categories.length >= 2) capacity += 2;
  capacity = clamp(capacity, 0, 40);

  // Gaps: fixable weaknesses (established, but missing something we sell).
  let gaps = 0;
  if (site === "none") gaps += 10;
  else if (site !== "own") gaps += 7;
  if (p.photosCount != null && p.photosCount < 10) gaps += 6;
  if (peers && peers.medianReviews >= 10 && reviews < 0.5 * peers.medianReviews) gaps += 10;
  if (!hours.listed) gaps += 4;
  if (!p.bookingLinks?.length) gaps += 3;
  if (p.totalScore != null && p.totalScore >= 3 && p.totalScore < 4.3) gaps += 2;
  gaps = clamp(gaps, 0, 35);

  // Reachability: can we actually get hold of them?
  const reachability = (p.phone ? 15 : 0) + (p.website ? 10 : 0);

  const score = Math.round(fit * (capacity + gaps + reachability));

  // Must still clear the bar on the full score, but order by the business-specific rank.
  const ranked = OFFERS.filter((o) => offers[o].score >= LEAD_MIN).sort((a, b) => rank[b] - rank[a]);
  const leadOffer = fit > 0 ? (ranked[0] ?? null) : null;
  const runnerUpOffer = leadOffer ? (ranked[1] ?? null) : null;

  return {
    score,
    breakdown: {
      fit,
      capacity: Math.round(capacity),
      gaps: Math.round(gaps),
      reachability,
      notes,
    },
    offers,
    leadOffer,
    runnerUpOffer,
  };
}

export const tierOf = (score: number | null): "A" | "B" | "C" | "D" =>
  score == null ? "D" : score >= 65 ? "A" : score >= 45 ? "B" : score >= 25 ? "C" : "D";
