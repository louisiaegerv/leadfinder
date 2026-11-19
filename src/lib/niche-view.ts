type RawParams = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export const NICHE_TABS = ["overview", "areas", "runs"] as const;
export type NicheTab = (typeof NICHE_TABS)[number];
export const RUN_STATUS_FILTERS = ["all", "ingested", "failed"] as const;
export type RunStatusFilter = (typeof RUN_STATUS_FILTERS)[number];
export const LIST_PAGE_SIZE = 12;

export type NicheView = { tab: NicheTab; q?: string; areaId?: number; status: RunStatusFilter; page: number };

/** Parse and clamp URL search params so a hand-edited URL can never break the page. */
export function parseNicheView(sp: RawParams): NicheView {
  const tab = one(sp.tab) as NicheTab;
  const status = one(sp.status) as RunStatusFilter;
  const areaId = Number(one(sp.area));
  return {
    tab: NICHE_TABS.includes(tab) ? tab : "overview",
    q: one(sp.q)?.trim() || undefined,
    areaId: Number.isInteger(areaId) && areaId > 0 ? areaId : undefined,
    status: RUN_STATUS_FILTERS.includes(status) ? status : "all",
    page: Math.max(1, Math.floor(Number(one(sp.page))) || 1),
  };
}

/** A run that is still moving, so the page keeps polling it: in Apify, waiting to be read in, or being scanned afterwards. */
export const isLiveRun = (r: { status: string; scanning: boolean }) =>
  r.status === "running" || r.status === "pending" || r.status === "succeeded" || r.scanning;

/** One page of a list; a page past the end lands on the last one. */
export function paginate<T>(items: T[], page: number, size = LIST_PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(page, pages);
  return { rows: items.slice((current - 1) * size, current * size), page: current, pages, total: items.length };
}

/** failed covers aborted too: both are runs that did not bring places in. */
export function matchesRunStatus(status: string, filter: RunStatusFilter): boolean {
  if (filter === "all") return true;
  if (filter === "ingested") return status === "ingested";
  return status === "failed" || status === "aborted";
}
