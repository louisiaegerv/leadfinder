const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The keyword at the start of a word, so "epoxy" matches "epoxy-coated" but "tile" does not match "textile". */
export const keywordRegex = (keyword: string, flags = "") => new RegExp(`(^|[^a-z0-9])${escapeRe(keyword)}`, flags);

/** Whether the keyword starts a word anywhere in `text`. Both are expected lower-cased. */
export const hasKeyword = (text: string, keyword: string) => keywordRegex(keyword).test(text);

/** A little of the text either side of the first place the keyword appears, cut at word edges, or null when it does not. */
export function contextAround(text: string, keyword: string, radius = 70): string | null {
  const m = keywordRegex(keyword, "i").exec(text);
  if (!m) return null;
  const start = m.index + m[1].length;
  const end = start + keyword.length;
  let from = Math.max(0, start - radius);
  let to = Math.min(text.length, end + radius);
  if (from > 0) {
    const space = text.indexOf(" ", from);
    if (space !== -1 && space < start) from = space + 1;
  }
  if (to < text.length) {
    const space = text.lastIndexOf(" ", to);
    if (space > end) to = space;
  }
  return `${from > 0 ? "…" : ""}${text.slice(from, to).trim()}${to < text.length ? "…" : ""}`;
}
