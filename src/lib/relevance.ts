import { contextAround, hasKeyword } from "./keyword-match";
import type { Playbook } from "./playbook";
import { websiteKind } from "./scoring";

export type RelevanceLabel = "target" | "adjacent" | "noise";
/** The reason the rules give when a business has no matching category and no keyword match: the one noise call a website can still overturn. */
export const NO_EVIDENCE_REASON = "No target category or keyword";

/**
 * The reason for a business whose category does not match, with no keyword, and no website to look at. That is not evidence
 * it is off-target (Google categories are often vague or wrong), so it stays undecided until something more is known.
 */
export const NO_SITE_REASON = "No matching category or keyword, and no website to check";

/** The same, for a business whose website exists but could not be read: blocked, broken, or built with JavaScript. */
export const NO_READ_REASON = "No matching category or keyword, and its website could not be read";

export type RuleResult = { label: RelevanceLabel | null; reason: string };

type PlaceLike = {
  title: string;
  categories: string[];
  domain?: string | null;
  /** Pass it (null when there is none) so a business with nothing to scan is told apart from one whose site simply does not match. */
  website?: string | null;
  /** True when the quick scan ran but could not read the site, and the paid reader has not either. Nothing to judge it on. */
  siteUnread?: boolean;
  /** What its website says about it (see siteTextSql), when the site has been scanned. */
  siteText?: string | null;
  /** All the text on its front page and About page (see page-text-db.ts), when saved. */
  pageText?: string | null;
};

const norm = (s: string) => s.toLowerCase().trim();

/**
 * Rules-only relevance. Returns label=null for the gray zone, which a later
 * phase sends to the LLM (cached per place+niche, user override wins).
 */
export function classifyByRules(place: PlaceLike, pb: Playbook): RuleResult {
  const title = norm(place.title);
  const domain = norm(place.domain ?? "");
  const cats = place.categories.map(norm);
  const broad = pb.broadCategories.map(norm);
  const include = [...pb.includeCategories.map(norm), ...broad];
  const exclude = pb.excludeCategories.map(norm);

  const chain = pb.chainExclusions.find((c) => {
    const n = norm(c);
    return n && (title.includes(n) || domain.includes(n.replace(/[^a-z0-9]/g, "")));
  });
  if (chain) return { label: "noise", reason: `Chain on exclusion list: ${chain}` };

  // Nothing configured: cannot judge by rules.
  if (include.length === 0 && pb.includeKeywords.length === 0) {
    return { label: null, reason: "No target categories or keywords configured" };
  }

  const primary = cats[0];
  const primaryHit = primary !== undefined && include.includes(primary);
  const anyHit = cats.some((c) => include.includes(c));
  // Each different keyword found is a point, wherever it was found. A keyword inside a longer one that also matched
  // ("epoxy" in "epoxy flooring") is the same finding, and so is the same keyword in both the name and the website.
  const siteText = norm(place.siteText ?? "");
  const pageText = norm(place.pageText ?? "");
  const hits = [...new Set(pb.includeKeywords.map(norm).filter(Boolean))]
    .map((k) => ({ k, inName: title.includes(k) || domain.includes(k), onSite: !!siteText && hasKeyword(siteText, k), onPage: !!pageText && hasKeyword(pageText, k) }))
    .filter((m) => m.inName || m.onSite || m.onPage);
  // Somewhere in a page's full text a keyword can appear in passing ("we also do a little coating"), so a keyword found only
  // there counts when at least two different keywords are found in that text. The name, domain and a site's own summary of itself count alone.
  const onPageCount = hits.filter((m) => m.onPage).length;
  const found = hits.filter((m) => m.inName || m.onSite || onPageCount >= 2);
  const matches = found.filter((m) => !found.some((o) => o.k !== m.k && o.k.includes(m.k)));
  const where = (m: (typeof found)[number]) => (m.inName ? "in name/domain" : m.onSite ? "on their website" : "in their page text");
  // For a keyword found only in the page text, a few words around it show what it was about.
  const say = (m: (typeof found)[number], i: number) => {
    const ctx = !m.inName && !m.onSite && i < 2 ? contextAround(place.pageText ?? "", m.k, 50) : null;
    return `keyword "${m.k}" ${where(m)}${ctx ? ` ("${ctx}")` : ""}`;
  };

  if (primary !== undefined && exclude.includes(primary) && !primaryHit) {
    return { label: "noise", reason: `Primary category "${place.categories[0]}" is excluded` };
  }

  // A broad category (like "Flooring contractor" for an epoxy niche) is worth one point, so it needs a keyword too.
  const primaryBroad = primaryHit && broad.includes(primary) && !pb.includeCategories.map(norm).includes(primary);
  const points = (primaryHit ? (primaryBroad ? 1 : 2) : anyHit ? 1 : 0) + matches.length;
  if (points >= 2) {
    const why = [
      primaryHit ? `primary category "${place.categories[0]}"` : anyHit ? "target category listed" : null,
      ...matches.map(say),
    ].filter(Boolean);
    return { label: "target", reason: why.join(" + ") };
  }
  if (points === 0) {
    if (place.categories.length === 0) return { label: null, reason: "No categories to judge" };
    const readable = ["own", "builder"].includes(websiteKind(place.domain ?? null, place.website ?? null));
    if ("website" in place && !readable) return { label: null, reason: NO_SITE_REASON };
    if (place.siteUnread) return { label: null, reason: NO_READ_REASON };
    return { label: "noise", reason: NO_EVIDENCE_REASON };
  }
  return {
    label: null,
    reason: primaryBroad
      ? `Broad category "${place.categories[0]}" with no keyword`
      : anyHit
        ? "Target category only as a secondary category"
        : matches[0].inName
          ? `Keyword "${matches[0].k}" only`
          : `Keyword "${matches[0].k}" on their website only`,
  };
}
