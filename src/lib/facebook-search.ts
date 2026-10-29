import type { Snippet } from "./owner-search";

/**
 * Finding a business's Facebook page from Google results. Plain code, no model: the job is to pick one
 * URL out of ten results, and the name, place and phone number in the result say whether it is the right one.
 */

const squeeze = (s: string) => s.replace(/\s+/g, " ").trim();

/** "{name} {city} {state} Facebook": what a person would type to find the page. Long SEO-stuffed names are cut short. */
export function facebookQuery(p: { title: string; city: string | null; state: string | null }): string {
  const name = squeeze(p.title.replace(/["“”]/g, "")).split(" ").slice(0, 12).join(" ");
  return squeeze(`${name} ${p.city ?? ""} ${p.state ?? ""} Facebook`);
}

// ---------- from a result url to a page ----------

const NOT_A_PAGE = new Set([
  "groups", "events", "watch", "marketplace", "hashtag", "photo", "photo.php", "photos", "reel", "reels", "share", "sharer", "sharer.php",
  "story.php", "permalink.php", "public", "login", "login.php", "policies", "help", "stories", "videos", "gaming", "fundraisers", "notes",
  "media", "ads", "business", "dialog", "plugins", "tr", "l.php", "privacy", "pages_reaction_units", "search",
]);

export type FacebookPage = { url: string; pageId: string | null };

/**
 * The page a Facebook URL belongs to, reduced to its root (a link to a post or the Reviews tab becomes the page),
 * with its numeric id when the URL carries one. Vanity URLs (facebook.com/AcmeEpoxy) have no id to read.
 */
export function facebookPage(url: string): FacebookPage | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/^(www|m|mobile|web)\./, "");
  if (host !== "facebook.com" && host !== "fb.com") return null;
  const parts = u.pathname.split("/").filter(Boolean);
  if (parts.length === 0) return null;
  const root = (...segs: string[]) => `https://www.facebook.com/${segs.map(encodeURIComponent).join("/")}`;
  const first = parts[0].toLowerCase();

  if (first === "profile.php") {
    const id = u.searchParams.get("id");
    return id && /^\d{5,}$/.test(id) ? { url: `https://www.facebook.com/profile.php?id=${id}`, pageId: id } : null;
  }
  if (first === "p" && parts[1]) return { url: root("p", parts[1]), pageId: /-(\d{8,})$/.exec(parts[1])?.[1] ?? null }; // /p/Acme-Epoxy-100063...
  if ((first === "people" || first === "pages") && parts[1] && parts[2]) return { url: root(first, parts[1], parts[2]), pageId: /^\d{8,}$/.test(parts[2]) ? parts[2] : null };
  if (first === "pg" && parts[1]) return { url: root(parts[1]), pageId: null }; // the old /pg/Name/ form
  if (NOT_A_PAGE.has(first)) return null;
  return { url: root(parts[0]), pageId: /^\d{8,}$/.test(parts[0]) ? parts[0] : null };
}

/** A convenience link to this page's ads in the Meta Ad Library. Needs the numeric page id. */
export function adLibraryUrl(pageId: string, country = "US"): string {
  return `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=${encodeURIComponent(country)}&view_all_page_id=${encodeURIComponent(pageId)}&search_type=page&media_type=all`;
}

// ---------- is it this business? ----------

const STOP = new Set(["llc", "llp", "pllc", "inc", "incorporated", "co", "company", "corp", "corporation", "ltd", "dba", "the", "and", "of", "at", "in", "by", "a", "an", "services", "service"]);

/** Lowercase words with accents and punctuation gone, crudely stemmed so "flooring" matches "floors". */
const stem = (w: string) => (w.length > 4 ? w.replace(/(ing|ers|er|es|s)$/, "") : w);
function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w.length >= 2 && !STOP.has(w))
    .map(stem);
}

export type FbCandidate = {
  url: string;
  pageId: string | null;
  /** The Google result it came from, so you can judge the match yourself. */
  title: string;
  description: string;
  position: number;
  /** 0 to 0.95: how sure we are this is the business's own page. */
  confidence: number;
  /** Accepted candidates are saved as the business's page; the rest are only shown as possibilities. */
  accepted: boolean;
};

export type FacebookSearchRecord = {
  query: string;
  snippetCount: number;
  best: FbCandidate | null;
  candidates: FbCandidate[];
};

const ACCEPT_OVERLAP = 0.6;
const ACCEPT_SCORE = 0.6;
const POSSIBLE_OVERLAP = 0.34;

/**
 * Pick the business's page from the search results. A result counts when most of the business name appears
 * in it; place and phone number raise the confidence. A near miss is listed as a possibility, never saved.
 */
export function matchFacebook(
  place: { title: string; city: string | null; state: string | null; phone: string | null },
  snippets: Snippet[],
): { best: FbCandidate | null; candidates: FbCandidate[] } {
  const nameTokens = [...new Set(tokens(place.title).slice(0, 6))]; // a long keyword-stuffed name must not dilute the match
  if (nameTokens.length === 0) return { best: null, candidates: [] };
  const where = [...tokens(place.city ?? ""), ...tokens(place.state ?? "")];
  const phone = (place.phone ?? "").replace(/\D/g, "").slice(-10);

  const byPage = new Map<string, FbCandidate & { score: number }>();
  snippets.forEach((s, i) => {
    const page = facebookPage(s.url);
    if (!page) return;
    const slug = decodeURIComponent(new URL(page.url).pathname).replace(/[-_/+.]/g, " ");
    const hay = new Set(tokens(`${s.title} ${s.description} ${slug}`));
    const overlap = nameTokens.filter((t) => hay.has(t)).length / nameTokens.length;
    if (overlap < POSSIBLE_OVERLAP) return;
    const digits = `${s.title} ${s.description}`.replace(/\D/g, "");
    const locationHit = where.length > 0 && where.some((w) => hay.has(w));
    const phoneHit = phone.length === 10 && digits.includes(phone);
    const score = overlap * 0.6 + (locationHit ? 0.2 : 0) + (phoneHit ? 0.25 : 0) + (i < 2 ? 0.1 : 0);
    const cand = {
      url: page.url,
      pageId: page.pageId,
      title: s.title,
      description: s.description,
      position: i + 1,
      confidence: Math.min(0.95, Math.round(score * 100) / 100),
      accepted: overlap >= ACCEPT_OVERLAP && score >= ACCEPT_SCORE,
      score,
    };
    const prior = byPage.get(page.url.toLowerCase());
    if (!prior || cand.score > prior.score) byPage.set(page.url.toLowerCase(), { ...cand, pageId: cand.pageId ?? prior?.pageId ?? null });
  });

  const candidates: FbCandidate[] = [...byPage.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((c) => ({ url: c.url, pageId: c.pageId, title: c.title, description: c.description, position: c.position, confidence: c.confidence, accepted: c.accepted }));
  return { best: candidates.find((c) => c.accepted) ?? null, candidates };
}
