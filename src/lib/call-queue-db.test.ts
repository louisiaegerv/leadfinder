import { beforeAll, describe, expect, it } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { dayKey, parseQueueParams, queueUrl } from "./call-queue";
import { addDays } from "./outreach";

const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "lf-queue-")), "t.db");
process.env.DATABASE_PATH = tmp;

describe("queue params and urls", () => {
  it("reads the flags and builds a business link that carries them", () => {
    expect(parseQueueParams({ q: "1", adj: "1" })).toEqual({ on: true, adjacent: true });
    expect(parseQueueParams({ q: "1" })).toEqual({ on: true, adjacent: false });
    expect(parseQueueParams({})).toEqual({ on: false, adjacent: false });
    expect(queueUrl(3, "ChIJ a/b", false)).toBe("/niches/3/places/ChIJ%20a%2Fb?q=1");
    expect(queueUrl(3, "X", true)).toBe("/niches/3/places/X?q=1&adj=1");
  });

  it("makes a local day key", () => {
    expect(dayKey(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
});

describe("the call queue", () => {
  let db: typeof import("@/db").db;
  let s: typeof import("@/db").schema;
  let q: typeof import("./call-queue-db");
  let o: typeof import("./outreach-db");
  let n1: number;
  let n2: number;
  const now = new Date(2026, 5, 10, 15, 0); // a Wednesday afternoon

  const mk = (id: string, over: Partial<typeof s.places.$inferInsert> = {}) =>
    db.insert(s.places).values({ placeId: id, title: `Biz ${id}`, categories: [], phone: `+1555${id.padStart(7, "0").slice(-7)}`, scrapedAt: now, ...over }).run();
  const link = (nicheId: number, id: string, over: Partial<typeof s.nichePlaces.$inferInsert> = {}) =>
    db.insert(s.nichePlaces).values({ nicheId, placeId: id, relevance: "target", score: 50, stage: "new", ...over }).run();
  const ids = (nicheId: number, adjacent = false) => q.getQueue(nicheId, { adjacent }, now).map((i) => `${i.kind === "followup" ? "F" : ""}${i.placeId}`);

  beforeAll(async () => {
    ({ db, schema: s } = await import("@/db"));
    q = await import("./call-queue-db");
    o = await import("./outreach-db");
    const { emptyPlaybook } = await import("./playbook");
    n1 = db.insert(s.niches).values({ name: "One", target: "", playbook: emptyPlaybook() }).returning().get().id;
    n2 = db.insert(s.niches).values({ name: "Two", target: "", playbook: emptyPlaybook() }).returning().get().id;
  });

  it("lists untouched targets with the best score first, and unscored ones last", () => {
    mk("1"); link(n1, "1", { score: 40 });
    mk("2"); link(n1, "2", { score: 90 });
    mk("3"); link(n1, "3", { score: null });
    mk("4"); link(n1, "4", { score: 65 });
    expect(ids(n1)).toEqual(["2", "4", "1", "3"]);
  });

  it("leaves out anyone you could not or should not call", () => {
    mk("NOPHONE", { phone: null }); link(n1, "NOPHONE", { score: 99 });
    mk("BLANK", { phone: "" }); link(n1, "BLANK", { score: 99 });
    mk("DNC"); link(n1, "DNC", { score: 99 });
    db.insert(s.contacts).values({ placeId: "DNC", doNotContact: true }).run();
    mk("CLOSED", { permanentlyClosed: true }); link(n1, "CLOSED", { score: 99 });
    mk("WON"); link(n1, "WON", { score: 99, stage: "won" });
    mk("DIALED"); link(n1, "DIALED", { score: 99, stage: "dialed" });
    mk("NOISE"); link(n1, "NOISE", { score: 99, relevance: "noise" });
    mk("UNDECIDED"); link(n1, "UNDECIDED", { score: 99, relevance: null });
    expect(ids(n1)).toEqual(["2", "4", "1", "3"]);
  });

  it("includes adjacent businesses only when asked", () => {
    mk("ADJ"); link(n1, "ADJ", { score: 70, relevance: "adjacent" });
    expect(ids(n1)).not.toContain("ADJ");
    expect(ids(n1, true)).toEqual(["2", "ADJ", "4", "1", "3"]);
  });

  it("keeps niches separate", () => {
    mk("OTHER"); link(n2, "OTHER", { score: 80 });
    expect(ids(n2)).toEqual(["OTHER"]);
    expect(ids(n1)).not.toContain("OTHER");
  });

  it("puts follow-ups that are due ahead of fresh leads, longest overdue first, and holds back future ones", () => {
    mk("F1"); link(n1, "F1", { stage: "dialed" });
    mk("F2"); link(n1, "F2", { stage: "dialed" });
    mk("F3"); link(n1, "F3", { stage: "dialed" });
    mk("F4"); link(n1, "F4", { stage: "dialed" });
    o.recordCall({ nicheId: n1, placeId: "F1", outcome: "no_answer", followUp: addDays(now, 0) }); // today
    o.recordCall({ nicheId: n1, placeId: "F2", outcome: "voicemail", followUp: addDays(now, -4) }); // overdue
    o.recordCall({ nicheId: n1, placeId: "F3", outcome: "callback", followUp: addDays(now, 2) }); // not yet
    o.recordCall({ nicheId: n1, placeId: "F4", outcome: "gatekeeper", followUp: addDays(now, -1) }); // overdue
    expect(ids(n1)).toEqual(["FF2", "FF4", "FF1", "2", "4", "1", "3"]);
  });

  it("does not offer a follow-up that belongs to another niche, or one with no phone", () => {
    mk("FN"); link(n2, "FN", { stage: "dialed" });
    o.recordCall({ nicheId: n2, placeId: "FN", outcome: "no_answer", followUp: addDays(now, -2) });
    mk("FP", { phone: null }); link(n1, "FP", { stage: "dialed" });
    o.recordCall({ nicheId: n1, placeId: "FP", outcome: "no_answer", followUp: addDays(now, -2) });
    expect(ids(n1)).not.toContain("FFN");
    expect(ids(n1)).not.toContain("FFP");
    expect(ids(n2)).toEqual(["FFN", "OTHER"]);
  });

  it("never offers anyone who asked not to be contacted, even with a follow-up", () => {
    mk("FD"); link(n1, "FD", { stage: "dialed" });
    o.recordCall({ nicheId: n1, placeId: "FD", outcome: "conversation", followUp: addDays(now, -1) });
    expect(ids(n1)).toContain("FFD");
    db.insert(s.contacts).values({ placeId: "FD", doNotContact: true }).onConflictDoUpdate({ target: s.contacts.placeId, set: { doNotContact: true } }).run();
    expect(ids(n1)).not.toContain("FFD");
  });

  it("counts follow-ups and fresh leads", () => {
    expect(q.queueCounts(n1, { adjacent: false }, now)).toEqual({ followUps: 3, fresh: 4, total: 7 });
  });

  it("moves a business out of the queue as soon as you log a call on it", () => {
    expect(q.nextLead(n1, null, { adjacent: false }, now)!.placeId).toBe("F2");
    o.recordCall({ nicheId: n1, placeId: "2", outcome: "no_answer", followUp: addDays(now, 2) });
    expect(ids(n1)).not.toContain("2");
  });

  it("next lead is the first one that is not the business you are on", () => {
    expect(q.nextLead(n1, "F2", { adjacent: false }, now)!.placeId).toBe("F4");
    expect(q.nextLead(n1, "F1", { adjacent: false }, now)!.placeId).toBe("F2");
    expect(q.nextLead(n1, "not-in-the-queue", { adjacent: false }, now)!.placeId).toBe("F2");
  });

  it("skip hides a business until midnight and writes nothing to the call log", () => {
    const logs = () => db.select().from(s.contactLog).all().length;
    const before = logs();
    q.skipToday("F2", now);
    q.skipToday("4", now);
    expect(logs()).toBe(before);
    expect(ids(n1)).not.toContain("FF2");
    expect(ids(n1)).not.toContain("4");
    expect(q.nextLead(n1, null, { adjacent: false }, now)!.placeId).toBe("F4");
    // the next day they are back
    const tomorrow = addDays(now, 1);
    expect(q.getQueue(n1, { adjacent: false }, tomorrow).map((i) => i.placeId)).toContain("4");
  });

  it("forgets yesterday's skips when a new one is written", () => {
    q.skipToday("1", addDays(now, 1));
    const stored = db.select().from(s.settings).all().find((r) => r.key === "queueSkip")!.value as { day: string; ids: string[] };
    expect(stored).toEqual({ day: dayKey(addDays(now, 1)), ids: ["1"] });
  });

  it("returns null when nothing is left to call", () => {
    expect(q.nextLead(99, null, { adjacent: false }, now)).toBeNull();
  });

  it("counts the calls made today across every niche, not yesterday's", () => {
    const base = q.dialsToday(now);
    db.insert(s.contactLog).values({ placeId: "1", nicheId: n1, outcome: "no_answer", createdAt: addDays(now, -1) }).run();
    expect(q.dialsToday(now)).toBe(base);
    db.insert(s.contactLog).values({ placeId: "1", nicheId: n1, outcome: "no_answer", createdAt: now }).run();
    db.insert(s.contactLog).values({ placeId: "OTHER", nicheId: n2, outcome: "voicemail", createdAt: now }).run();
    expect(q.dialsToday(now)).toBe(base + 2);
  });

  it("keeps a daily goal, lets you clear it, and refuses nonsense", () => {
    expect(q.getDailyGoal()).toBeNull();
    q.setDailyGoal(30);
    expect(q.getDailyGoal()).toBe(30);
    q.setDailyGoal(null);
    expect(q.getDailyGoal()).toBeNull();
    for (const bad of [0, -3, 2.5, 100000]) expect(() => q.setDailyGoal(bad)).toThrow();
  });
});
