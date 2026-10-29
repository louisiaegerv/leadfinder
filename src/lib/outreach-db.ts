import { and, asc, desc, eq, isNotNull, isNull, notInArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { contactLog, contacts, nichePlaces, niches, places } from "@/db/schema";
import type { OfferKey, Stage } from "./offers";
import { TERMINAL_OUTCOMES, addDays, startOfDay, stageAfter, type Outcome } from "./outreach";

export type CallInput = {
  nicheId: number;
  placeId: string;
  outcome: Outcome;
  notes?: string | null;
  objection?: string | null;
  offer?: OfferKey | null;
  followUp?: Date | null;
};

/**
 * Log a call and move the prospect's stage for that niche. History and the
 * do-not-contact flag belong to the business, so they are shared across niches.
 */
export function recordCall(input: CallInput): { stage: Stage } {
  const terminal = TERMINAL_OUTCOMES.includes(input.outcome);
  return db.transaction((tx) => {
    tx.insert(contactLog)
      .values({
        placeId: input.placeId,
        nicheId: input.nicheId,
        outcome: input.outcome,
        notes: input.notes?.trim() || null,
        objection: input.objection?.trim() || null,
        offer: input.offer ?? null,
        followUp: terminal ? null : (input.followUp ?? null),
      })
      .run();

    const where = and(eq(nichePlaces.nicheId, input.nicheId), eq(nichePlaces.placeId, input.placeId));
    const current = tx.select({ stage: nichePlaces.stage }).from(nichePlaces).where(where).get();
    const stage = stageAfter(current?.stage ?? "new", input.outcome);
    if (current && stage !== current.stage) tx.update(nichePlaces).set({ stage }).where(where).run();

    if (input.outcome === "dnc") {
      tx.insert(contacts)
        .values({ placeId: input.placeId, doNotContact: true, updatedAt: new Date() })
        .onConflictDoUpdate({ target: contacts.placeId, set: { doNotContact: true, updatedAt: new Date() } })
        .run();
    }
    return { stage };
  });
}

export function getCallLog(placeId: string) {
  return db
    .select({
      id: contactLog.id,
      outcome: contactLog.outcome,
      notes: contactLog.notes,
      objection: contactLog.objection,
      offer: contactLog.offer,
      followUp: contactLog.followUp,
      createdAt: contactLog.createdAt,
      nicheName: niches.name,
    })
    .from(contactLog)
    .leftJoin(niches, eq(niches.id, contactLog.nicheId))
    .where(eq(contactLog.placeId, placeId))
    .orderBy(desc(contactLog.createdAt), desc(contactLog.id))
    .all();
}

/**
 * Open follow-ups: a business's most recent log entry decides, so logging a newer
 * call without a date clears the old one. Closed (won/lost) and do-not-contact are left out.
 */
export function getFollowUps() {
  return db
    .select({
      logId: contactLog.id,
      placeId: places.placeId,
      title: places.title,
      phone: places.phone,
      imageUrl: places.imageUrl,
      thumbnailUrl: places.thumbnailUrl,
      logoUrl: places.logoUrl,
      followUp: contactLog.followUp,
      outcome: contactLog.outcome,
      notes: contactLog.notes,
      nicheId: contactLog.nicheId,
      nicheName: niches.name,
      stage: nichePlaces.stage,
      leadOffer: nichePlaces.leadOffer,
    })
    .from(contactLog)
    .innerJoin(places, eq(places.placeId, contactLog.placeId))
    .leftJoin(contacts, eq(contacts.placeId, contactLog.placeId))
    .leftJoin(niches, eq(niches.id, contactLog.nicheId))
    .leftJoin(nichePlaces, and(eq(nichePlaces.placeId, contactLog.placeId), eq(nichePlaces.nicheId, contactLog.nicheId)))
    .where(
      and(
        isNotNull(contactLog.followUp),
        sql`${contactLog.id} = (select max(l2.id) from contact_log l2 where l2.place_id = ${contactLog.placeId})`,
        or(isNull(contacts.doNotContact), eq(contacts.doNotContact, false)),
        or(isNull(nichePlaces.stage), notInArray(nichePlaces.stage, ["won", "lost"])),
      ),
    )
    .orderBy(asc(contactLog.followUp), asc(places.title))
    .all();
}

/** Follow-ups due today or earlier, for the sidebar badge. */
export function countDueFollowUps(now = new Date()): number {
  const cutoff = addDays(startOfDay(now), 1).getTime();
  return getFollowUps().filter((f) => f.followUp != null && f.followUp.getTime() < cutoff).length;
}

export function deleteLogEntry(logId: number) {
  db.delete(contactLog).where(eq(contactLog.id, logId)).run();
}

export function clearFollowUp(logId: number) {
  db.update(contactLog).set({ followUp: null }).where(eq(contactLog.id, logId)).run();
}

export function getRecentActivity(limit = 25) {
  return db
    .select({
      id: contactLog.id,
      placeId: places.placeId,
      title: places.title,
      outcome: contactLog.outcome,
      notes: contactLog.notes,
      objection: contactLog.objection,
      createdAt: contactLog.createdAt,
      nicheId: contactLog.nicheId,
      nicheName: niches.name,
    })
    .from(contactLog)
    .innerJoin(places, eq(places.placeId, contactLog.placeId))
    .leftJoin(niches, eq(niches.id, contactLog.nicheId))
    .orderBy(desc(contactLog.createdAt), desc(contactLog.id))
    .limit(limit)
    .all();
}

/** How often each objection came up, and for which offer, so you can see what to get better at answering. */
export function getObjectionTally() {
  const rows = db
    .select({ objection: contactLog.objection, offer: contactLog.offer, n: sql<number>`count(*)` })
    .from(contactLog)
    .where(isNotNull(contactLog.objection))
    .groupBy(contactLog.objection, contactLog.offer)
    .all();
  const byObjection = new Map<string, { objection: string; total: number; offers: Map<OfferKey | null, number> }>();
  for (const r of rows) {
    const key = r.objection!;
    const entry = byObjection.get(key) ?? { objection: key, total: 0, offers: new Map() };
    entry.total += r.n;
    entry.offers.set(r.offer, (entry.offers.get(r.offer) ?? 0) + r.n);
    byObjection.set(key, entry);
  }
  return [...byObjection.values()]
    .sort((a, b) => b.total - a.total)
    .map((e) => ({ objection: e.objection, total: e.total, offers: [...e.offers].map(([offer, n]) => ({ offer, n })).sort((a, b) => b.n - a.n) }));
}
