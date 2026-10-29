export const DETAIL_TABS = ["outreach", "score", "details"] as const;
export type DetailTab = (typeof DETAIL_TABS)[number];

/** Which tab a ?tab= value names; anything unknown falls back to the outreach tab. */
export const parseTab = (v: string | string[] | undefined): DetailTab => {
  const one = Array.isArray(v) ? v[0] : v;
  return DETAIL_TABS.find((t) => t === one) ?? "outreach";
};
