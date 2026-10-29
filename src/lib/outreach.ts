import type { Stage } from "./offers";

/** What happened on a call. Each outcome knows which stage it moves a prospect to. */
export const OUTCOMES = [
  "no_answer",
  "voicemail",
  "gatekeeper",
  "wrong_number",
  "callback",
  "conversation",
  "booked",
  "not_interested",
  "dnc",
] as const;
export type Outcome = (typeof OUTCOMES)[number];

export const OUTCOME_INFO: Record<Outcome, { label: string; stage: Stage; followUpDays: number | null }> = {
  no_answer: { label: "No answer", stage: "dialed", followUpDays: 2 },
  voicemail: { label: "Left voicemail", stage: "dialed", followUpDays: 3 },
  gatekeeper: { label: "Not the owner / gatekeeper", stage: "dialed", followUpDays: 2 },
  wrong_number: { label: "Wrong or dead number", stage: "dialed", followUpDays: null },
  callback: { label: "Spoke, call back later", stage: "conversation", followUpDays: 3 },
  conversation: { label: "Had a conversation", stage: "conversation", followUpDays: 7 },
  booked: { label: "Meeting booked", stage: "booked", followUpDays: null },
  not_interested: { label: "Not interested", stage: "lost", followUpDays: null },
  dnc: { label: "Asked not to be contacted", stage: "lost", followUpDays: null },
};

/** Outcomes that end the conversation: no follow-up is kept for them. */
export const TERMINAL_OUTCOMES: readonly Outcome[] = ["wrong_number", "not_interested", "dnc"];

export const STAGE_LABEL: Record<Stage, string> = {
  new: "Not contacted",
  dialed: "Dialed",
  conversation: "In conversation",
  booked: "Meeting booked",
  held: "Meeting held",
  proposal: "Proposal sent",
  won: "Won",
  lost: "Lost",
};

const RANK: Record<Stage, number> = { new: 0, dialed: 1, conversation: 2, booked: 3, held: 4, proposal: 5, won: 6, lost: -1 };

/**
 * Where a prospect lands after a logged call. Stages only move forward on their
 * own (a voicemail never undoes "meeting booked"); a negative outcome closes it;
 * and a real conversation reopens a lost prospect, while another unanswered dial doesn't.
 */
export function stageAfter(current: Stage, outcome: Outcome): Stage {
  const target = OUTCOME_INFO[outcome].stage;
  if (target === "lost") return "lost";
  if (current === "lost") return target === "dialed" ? "lost" : target;
  return RANK[target] > RANK[current] ? target : current;
}

export const OBJECTIONS = [
  "Already have someone",
  "No budget / too expensive",
  "Send me info",
  "Bad timing / too busy",
  "Burned by an agency before",
  "Doesn't think it works",
  "Gets enough work already",
  "Not interested",
] as const;

// ---------- follow-up dates ----------

/** "YYYY-MM-DD" from a date input to local midnight, or null when empty or invalid. */
export function parseFollowUp(value: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d ? date : null;
}

export function toDateInput(date: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

export function addDays(base: Date, days: number): Date {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);
}

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export type DueBucket = "overdue" | "today" | "upcoming";

/** Compares calendar days, so a follow-up for "today" is never overdue at 4pm. */
export function dueBucket(followUp: Date, now: Date): DueBucket {
  const day = startOfDay(followUp).getTime();
  const today = startOfDay(now).getTime();
  return day < today ? "overdue" : day === today ? "today" : "upcoming";
}
