export const MAX_TAG = 40;

/** A tag as it is stored: one line, trimmed, no commas or semicolons (they separate tags in the export). Null if nothing is left. */
export function cleanTag(raw: string | null | undefined): string | null {
  const t = (raw ?? "").replace(/[,;]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_TAG).trim();
  return t || null;
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** The list with the tag added. Tags match without regard to case, so "Hot" and "hot" are one tag. Returns the same array if nothing changed. */
export function withTag(tags: string[] | null, tag: string): string[] {
  const list = tags ?? [];
  return list.some((t) => same(t, tag)) ? list : [...list, tag];
}

/** The list without the tag. Returns the same array if it was not there. */
export function withoutTag(tags: string[] | null, tag: string): string[] {
  const list = tags ?? [];
  return list.some((t) => same(t, tag)) ? list.filter((t) => !same(t, tag)) : list;
}
