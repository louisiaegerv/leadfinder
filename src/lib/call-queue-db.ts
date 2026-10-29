import { and, asc, desc, eq, gte, inArray, isNull, ne, or, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { contactLog, contacts, nichePlaces, places, settings } from "@/db/schema";
import type { OfferKey } from "./offers";
import { dueBucket, startOfDay } from "./outreach";
import { getFollowUps } from "./outreach-db";
import { MAX_DAILY_GOAL, dayKey, type QueueKind, type QueueParams } from "./call-queue";

export type QueueItem = {
  kind: QueueKind;
  placeId: string;
  title: string;
  phone: string;
  score: number | null;
  leadOffer: OfferKey | null;
  ownerName: string | null;
};

const SKIP_KEY = "queueSkip";
const GOAL_KEY = "dailyGoal";

type SkipState = { day: string; ids: string[] };

function readSetting<T>(key: string): T | undefined {
  return db.select().from(settings).where(eq(settings.key, key)).get()?.value as T | undefined;
}
function writeSetting(key: string, value: unknown) {
  db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } }).run();
}

/** Businesses skipped today. Yesterday's skips are forgotten, so a skip only ever lasts until midnight. */
function skippedToday(now: Date): Set<string> {
  const s = readSetting<SkipState>(SKIP_KEY);
  return new Set(s && s.day === dayKey(now) ? s.ids : []);
}

/** Hide a business from the queue for the rest of today. Writes nothing to the call log. */
export function skipToday(placeId: string, now = new Date()) {
  const ids = skippedToday(now);
  ids.add(placeId);
  writeSetting(SKIP_KEY, { day: dayKey(now), ids: [...ids] } satisfies SkipState);
}

/**
 * Who to call, in order: follow-ups that are due (the longest overdue first), then untouched leads with the best score.
 * Only businesses with a phone number and not marked do-not-contact are included, and nothing skipped today.
 * Calling someone moves them out of the fresh pool by itself, so nothing needs to remember a position.
 */
export function getQueue(nicheId: number, opts: Pick<QueueParams, "adjacent">, now = new Date()): QueueItem[] {
  const skipped = skippedToday(now);

  const due: QueueItem[] = getFollowUps()
    .filter((f) => f.nicheId === nicheId && f.phone && f.followUp && dueBucket(f.followUp, now) !== "upcoming" && !skipped.has(f.placeId))
    .map((f) => ({ kind: "followup", placeId: f.placeId, title: f.title, phone: f.phone!, score: null, leadOffer: f.leadOffer, ownerName: null }));

  const fresh: QueueItem[] = db
    .select({
      placeId: places.placeId,
      title: places.title,
      phone: places.phone,
      score: nichePlaces.score,
      leadOffer: nichePlaces.leadOffer,
      ownerName: contacts.ownerName,
    })
    .from(nichePlaces)
    .innerJoin(places, eq(places.placeId, nichePlaces.placeId))
    .leftJoin(contacts, eq(contacts.placeId, nichePlaces.placeId))
    .where(
      and(
        eq(nichePlaces.nicheId, nicheId),
        eq(nichePlaces.stage, "new"),
        inArray(nichePlaces.relevance, opts.adjacent ? ["target", "adjacent"] : ["target"]),
        isNotNull(places.phone),
        ne(places.phone, ""),
        or(isNull(contacts.doNotContact), eq(contacts.doNotContact, false)),
        or(isNull(places.permanentlyClosed), eq(places.permanentlyClosed, false)),
      ),
    )
    .orderBy(sql`${nichePlaces.score} is null`, desc(nichePlaces.score), asc(places.title))
    .all()
    .filter((r) => !skipped.has(r.placeId))
    .map((r) => ({ kind: "fresh", placeId: r.placeId, title: r.title, phone: r.phone!, score: r.score, leadOffer: r.leadOffer, ownerName: r.ownerName }));

  // A follow-up's business is already past "not contacted", so it is never in both lists.
  return [...due, ...fresh];
}

export function queueCounts(nicheId: number, opts: Pick<QueueParams, "adjacent">, now = new Date()) {
  const q = getQueue(nicheId, opts, now);
  const followUps = q.filter((i) => i.kind === "followup").length;
  return { followUps, fresh: q.length - followUps, total: q.length };
}

/** The first business in the queue other than the one you are on. */
export function nextLead(nicheId: number, fromPlaceId: string | null, opts: Pick<QueueParams, "adjacent">, now = new Date()): QueueItem | null {
  return getQueue(nicheId, opts, now).find((i) => i.placeId !== fromPlaceId) ?? null;
}

/** Calls logged since midnight, across every niche. */
export function dialsToday(now = new Date()): number {
  return db
    .select({ n: sql<number>`count(*)` })
    .from(contactLog)
    .where(gte(contactLog.createdAt, startOfDay(now)))
    .get()!.n;
}

export function getDailyGoal(): number | null {
  const g = readSetting<number>(GOAL_KEY);
  return typeof g === "number" && g > 0 ? g : null;
}

/** A target number of calls a day, or null for none. */
export function setDailyGoal(goal: number | null) {
  if (goal != null && (!Number.isInteger(goal) || goal < 1 || goal > MAX_DAILY_GOAL)) throw new Error(`Pick a whole number from 1 to ${MAX_DAILY_GOAL}`);
  if (goal == null) db.delete(settings).where(eq(settings.key, GOAL_KEY)).run();
  else writeSetting(GOAL_KEY, goal);
}
