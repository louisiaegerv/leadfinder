/** Pieces of the call queue that the browser needs too, so they hold no database code. */

export type QueueKind = "followup" | "fresh";

export const KIND_LABEL: Record<QueueKind, string> = { followup: "Follow-up due", fresh: "Fresh lead" };

export type QueueParams = {
  /** The page is being viewed as part of working the queue. */
  on: boolean;
  /** Fresh leads also include businesses marked adjacent, not only targets. */
  adjacent: boolean;
};

type Raw = Record<string, string | string[] | undefined>;
const flag = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) === "1";

export function parseQueueParams(sp: Raw): QueueParams {
  return { on: flag(sp.q), adjacent: flag(sp.adj) };
}

/** A business's page, opened as part of the queue. */
export function queueUrl(nicheId: number, placeId: string, adjacent: boolean): string {
  return `/niches/${nicheId}/places/${encodeURIComponent(placeId)}?q=1${adjacent ? "&adj=1" : ""}`;
}

/** "YYYY-MM-DD" in local time, used to make a skip last until midnight. */
export function dayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export const MAX_DAILY_GOAL = 500;
