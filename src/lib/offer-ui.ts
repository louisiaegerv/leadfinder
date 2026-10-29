import type { OfferKey } from "./offers";

/** Tailwind classes per offer, so a lead offer reads at a glance across table, map and detail. */
export const OFFER_STYLE: Record<OfferKey, { chip: string; bar: string; dot: string; hex: string }> = {
  facebook_ads: { chip: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200", bar: "bg-blue-500", dot: "bg-blue-500", hex: "#3b82f6" },
  speed_to_lead: { chip: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200", bar: "bg-amber-500", dot: "bg-amber-500", hex: "#f59e0b" },
  db_reactivation: { chip: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200", bar: "bg-violet-500", dot: "bg-violet-500", hex: "#8b5cf6" },
  review_system: { chip: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200", bar: "bg-emerald-500", dot: "bg-emerald-500", hex: "#10b981" },
  website: { chip: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200", bar: "bg-rose-500", dot: "bg-rose-500", hex: "#f43f5e" },
};

export const TIER_STYLE = {
  A: "bg-emerald-600 text-white",
  B: "bg-sky-600 text-white",
  C: "bg-amber-500 text-white",
  D: "bg-slate-400 text-white",
} as const;

export const TIER_HEX = { A: "#059669", B: "#0284c7", C: "#f59e0b", D: "#94a3b8" } as const;
