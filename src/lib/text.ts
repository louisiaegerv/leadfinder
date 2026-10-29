/** One-per-line textarea value -> trimmed, de-duplicated (case-insensitive) list. */
export function lines(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const l of text.split(/\r?\n/)) {
    const t = l.trim();
    if (t && !seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase());
      out.push(t);
    }
  }
  return out;
}
