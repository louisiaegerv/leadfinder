import { beforeAll, describe, expect, it } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { OUTCOMES, dueBucket, parseFollowUp, stageAfter, toDateInput } from "./outreach";
import { buildBrief, briefToText } from "./pitch";

describe("stageAfter", () => {
  it("moves forward on a first dial and on a conversation", () => {
    expect(stageAfter("new", "no_answer")).toBe("dialed");
    expect(stageAfter("dialed", "conversation")).toBe("conversation");
    expect(stageAfter("conversation", "booked")).toBe("booked");
  });

  it("never moves backward on its own", () => {
    expect(stageAfter("booked", "voicemail")).toBe("booked");
    expect(stageAfter("proposal", "conversation")).toBe("proposal");
    expect(stageAfter("won", "no_answer")).toBe("won");
  });

  it("closes the prospect on a negative outcome, from any stage", () => {
    expect(stageAfter("new", "not_interested")).toBe("lost");
    expect(stageAfter("booked", "dnc")).toBe("lost");
  });

  it("lets a real conversation reopen a lost prospect but not another dial", () => {
    expect(stageAfter("lost", "no_answer")).toBe("lost");
    expect(stageAfter("lost", "conversation")).toBe("conversation");
    expect(stageAfter("lost", "booked")).toBe("booked");
  });

  it("has a defined stage for every outcome", () => {
    for (const o of OUTCOMES) expect(stageAfter("new", o)).toBeTruthy();
  });
});

describe("follow-up dates", () => {
  it("parses a date input as local midnight and rejects junk and impossible dates", () => {
    const d = parseFollowUp("2026-03-09")!;
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 2, 9, 0]);
    expect(toDateInput(d)).toBe("2026-03-09");
    expect(parseFollowUp("")).toBeNull();
    expect(parseFollowUp(null)).toBeNull();
    expect(parseFollowUp("09/03/2026")).toBeNull();
    expect(parseFollowUp("2026-02-31")).toBeNull();
  });

  it("buckets by calendar day, so today is not overdue late in the day", () => {
    const evening = new Date(2026, 5, 10, 17, 30);
    expect(dueBucket(new Date(2026, 5, 9), evening)).toBe("overdue");
    expect(dueBucket(new Date(2026, 5, 10), evening)).toBe("today");
    expect(dueBucket(new Date(2026, 5, 11), evening)).toBe("upcoming");
  });
});

describe("buildBrief", () => {
  const base = { title: "Acme Concrete", reviews: 120, rating: 4.7, runnerUp: null, evidence: ["Few photos on Google", "Pending: Facebook not checked"] };

  it("uses the business's own facts and drops 'Pending' lines", () => {
    const b = buildBrief({ ...base, offer: "review_system" });
    expect(b.hook).toContain("120 Google reviews at 4.7 stars");
    expect(b.facts).toEqual(["Few photos on Google"]);
    expect(b.objections.length).toBeGreaterThan(3);
    expect(b.fallback).toBeNull();
  });

  it("tells you who to ask for when the owner is known, and says nothing when not", () => {
    const withOwner = buildBrief({ ...base, offer: "review_system", owner: "Jane Doe" });
    expect(withOwner.askFor).toBe("Jane Doe");
    expect(briefToText(withOwner, "Acme Concrete")).toContain("Ask for: Jane Doe");
    expect(buildBrief({ ...base, offer: "review_system" }).askFor).toBeNull();
    expect(briefToText(buildBrief({ ...base, offer: "review_system", owner: "  " }), "Acme")).not.toContain("Ask for:");
  });

  it("still reads sensibly with no reviews and offers the runner-up as a pivot", () => {
    const b = buildBrief({ ...base, reviews: null, rating: null, offer: "facebook_ads", runnerUp: "speed_to_lead" });
    expect(b.hook).not.toMatch(/null|undefined/);
    expect(b.fallback?.offer).toBe("speed_to_lead");
    const text = briefToText(b, "Acme Concrete");
    expect(text).toContain("pivot to Speed to lead");
    expect(text).not.toMatch(/null|undefined/);
  });
});

// ---------- database ----------

const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "lf-out-")), "t.db");
process.env.DATABASE_PATH = tmp;

describe("outreach database", () => {
  let db: typeof import("@/db").db;
  let s: typeof import("@/db").schema;
  let o: typeof import("./outreach-db");
  let eq: typeof import("drizzle-orm").eq;
  let and: typeof import("drizzle-orm").and;
  let nicheId = 0;
  let nicheB = 0;

  const place = (id: string, title = `Biz ${id}`) => {
    db.insert(s.places).values({ placeId: id, title, categories: [], scrapedAt: new Date() }).run();
    db.insert(s.nichePlaces).values({ nicheId, placeId: id }).run();
    db.insert(s.nichePlaces).values({ nicheId: nicheB, placeId: id }).run();
  };
  const stageOf = (id: string, n = nicheId) =>
    db.select().from(s.nichePlaces).where(and(eq(s.nichePlaces.placeId, id), eq(s.nichePlaces.nicheId, n))).get()!.stage;
  const day = (offset: number) => new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() + offset);

  beforeAll(async () => {
    ({ db, schema: s } = await import("@/db"));
    o = await import("./outreach-db");
    ({ eq, and } = await import("drizzle-orm"));
    const { emptyPlaybook } = await import("./playbook");
    nicheId = db.insert(s.niches).values({ name: "A", target: "", playbook: emptyPlaybook() }).returning().get().id;
    nicheB = db.insert(s.niches).values({ name: "B", target: "", playbook: emptyPlaybook() }).returning().get().id;
  });

  it("logs a call, advances the stage for that niche only, and keeps history per business", () => {
    place("p1");
    o.recordCall({ nicheId, placeId: "p1", outcome: "no_answer", followUp: day(1) });
    expect(stageOf("p1")).toBe("dialed");
    expect(stageOf("p1", nicheB)).toBe("new");

    o.recordCall({ nicheId: nicheB, placeId: "p1", outcome: "voicemail", notes: "  left a message  " });
    const log = o.getCallLog("p1");
    expect(log).toHaveLength(2); // history is the business's, whichever niche it was logged from
    expect(log.map((l) => l.nicheName).sort()).toEqual(["A", "B"]);
    expect(log.find((l) => l.outcome === "voicemail")!.notes).toBe("left a message");
  });

  it("follow-ups: the latest entry decides, ordered by date, clearing and closing drop them", () => {
    place("f1", "Overdue Co");
    place("f2", "Later Co");
    place("f3", "Cleared Co");
    place("f4", "Won Co");
    o.recordCall({ nicheId, placeId: "f1", outcome: "callback", followUp: day(-2) });
    o.recordCall({ nicheId, placeId: "f2", outcome: "conversation", followUp: day(5) });
    o.recordCall({ nicheId, placeId: "f3", outcome: "callback", followUp: day(1) });
    o.recordCall({ nicheId, placeId: "f3", outcome: "conversation" }); // newer call, no date: clears the old one
    o.recordCall({ nicheId, placeId: "f4", outcome: "callback", followUp: day(1) });
    db.update(s.nichePlaces).set({ stage: "won" }).where(and(eq(s.nichePlaces.placeId, "f4"), eq(s.nichePlaces.nicheId, nicheId))).run();

    const titles = o.getFollowUps().map((f) => f.title).filter((t) => /Co$/.test(t));
    expect(titles).toEqual(["Overdue Co", "Later Co"]);
    expect(o.countDueFollowUps()).toBeGreaterThanOrEqual(1);

    const later = o.getFollowUps().find((f) => f.title === "Later Co")!;
    o.clearFollowUp(later.logId);
    expect(o.getFollowUps().some((f) => f.title === "Later Co")).toBe(false);
  });

  it("a terminal outcome keeps no follow-up; do-not-contact sets the shared flag and closes the prospect", () => {
    place("d1");
    o.recordCall({ nicheId, placeId: "d1", outcome: "not_interested", objection: "Already have someone", followUp: day(3) });
    expect(o.getCallLog("d1")[0].followUp).toBeNull();
    expect(stageOf("d1")).toBe("lost");

    place("d2");
    o.recordCall({ nicheId, placeId: "d2", outcome: "callback", followUp: day(1) });
    o.recordCall({ nicheId, placeId: "d2", outcome: "dnc" });
    expect(db.select().from(s.contacts).where(eq(s.contacts.placeId, "d2")).get()!.doNotContact).toBe(true);
    expect(o.getFollowUps().some((f) => f.placeId === "d2")).toBe(false);
  });

  it("tallies objections with the offer they came up on", () => {
    place("t1");
    o.recordCall({ nicheId, placeId: "t1", outcome: "conversation", objection: "No budget / too expensive", offer: "facebook_ads" });
    o.recordCall({ nicheId, placeId: "t1", outcome: "conversation", objection: "No budget / too expensive", offer: "facebook_ads" });
    const t = o.getObjectionTally().find((x) => x.objection === "No budget / too expensive")!;
    expect(t.total).toBe(2);
    expect(t.offers[0]).toEqual({ offer: "facebook_ads", n: 2 });
  });
});
