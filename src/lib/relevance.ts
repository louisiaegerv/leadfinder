import type { Playbook } from "./playbook";

export type RelevanceLabel = "target" | "adjacent" | "noise";
export type RuleResult = { label: RelevanceLabel | null; reason: string };

type PlaceLike = {
  title: string;
  categories: string[];
  domain?: string | null;
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
  const include = pb.includeCategories.map(norm);
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
  const kwHit = pb.includeKeywords.map(norm).find((k) => k && (title.includes(k) || domain.includes(k)));

  if (primary !== undefined && exclude.includes(primary) && !primaryHit) {
    return { label: "noise", reason: `Primary category "${place.categories[0]}" is excluded` };
  }

  const points = (primaryHit ? 2 : anyHit ? 1 : 0) + (kwHit ? 1 : 0);
  if (points >= 2) {
    const why = [
      primaryHit ? `primary category "${place.categories[0]}"` : anyHit ? "target category listed" : null,
      kwHit ? `keyword "${kwHit}" in name/domain` : null,
    ].filter(Boolean);
    return { label: "target", reason: why.join(" + ") };
  }
  if (points === 0) {
    return {
      label: place.categories.length ? "noise" : null,
      reason: place.categories.length
        ? "No target category or keyword"
        : "No categories to judge",
    };
  }
  return {
    label: null,
    reason: anyHit ? "Target category only as a secondary category" : `Keyword "${kwHit}" only`,
  };
}
