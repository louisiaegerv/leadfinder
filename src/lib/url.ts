/** Build a link that keeps the current query string and applies a patch (null removes a key). */
export function withParams(
  base: string,
  current: Record<string, string | string[] | undefined>,
  patch: Record<string, string | null>,
): string {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(current)) {
    const val = Array.isArray(v) ? v[0] : v;
    if (val) next.set(k, val);
  }
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) next.delete(k);
    else next.set(k, v);
  }
  const qs = next.toString();
  return qs ? `${base}?${qs}` : base;
}
