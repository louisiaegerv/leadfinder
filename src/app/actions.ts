"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { areas, contacts, nichePlaces, niches } from "@/db/schema";
import { reclassifyNiche, rescoreNiche } from "@/lib/rescore";
import { areaShape } from "@/lib/areas";
import { clonePlaybook } from "@/lib/presets";
import { playbookSchema } from "@/lib/playbook";
import { OFFERS, STAGES } from "@/lib/offers";
import { OUTCOMES, parseFollowUp } from "@/lib/outreach";
import { clearFollowUp, deleteLogEntry, recordCall } from "@/lib/outreach-db";

const nicheInput = z.object({
  name: z.string().trim().min(1, "Give the niche a name"),
  presetKey: z.string().nullable().default(null),
  target: z.string().default(""),
  playbook: playbookSchema,
});

export async function createNiche(input: z.input<typeof nicheInput>) {
  const v = nicheInput.parse(input);
  const row = db
    .insert(niches)
    .values({ name: v.name, presetKey: v.presetKey, target: v.target, playbook: v.playbook })
    .returning()
    .get();
  revalidatePath("/", "layout");
  return { id: row.id };
}

export async function updateNiche(id: number, input: Omit<z.input<typeof nicheInput>, "presetKey">) {
  const v = nicheInput.omit({ presetKey: true }).parse(input);
  db.update(niches).set({ name: v.name, target: v.target, playbook: v.playbook }).where(eq(niches.id, id)).run();
  // New categories/keywords/weights apply to places already in this niche (not other niches).
  reclassifyNiche(id);
  rescoreNiche(id);
  revalidatePath("/", "layout");
}

/** Manual relevance for one business in one niche. "auto" hands it back to the rules. */
export async function setRelevance(
  nicheId: number,
  placeId: string,
  label: "target" | "adjacent" | "noise" | "auto",
) {
  const where = and(eq(nichePlaces.nicheId, nicheId), eq(nichePlaces.placeId, placeId));
  if (label === "auto") {
    db.update(nichePlaces).set({ relevance: null, relevanceReason: null, relevanceSource: null }).where(where).run();
    reclassifyNiche(nicheId);
  } else {
    db.update(nichePlaces)
      .set({ relevance: label, relevanceReason: "Set manually", relevanceSource: "user" })
      .where(where)
      .run();
  }
  rescoreNiche(nicheId);
  revalidatePath(`/niches/${nicheId}`, "layout");
}

/** One flag per business, shared by every niche that tracks it. */
export async function setDoNotContact(placeId: string, flag: boolean) {
  db.insert(contacts)
    .values({ placeId, doNotContact: flag, updatedAt: new Date() })
    .onConflictDoUpdate({ target: contacts.placeId, set: { doNotContact: flag, updatedAt: new Date() } })
    .run();
  revalidatePath("/niches", "layout");
}

/** Copies settings and areas only. Runs and pipeline start empty. */
export async function duplicateNiche(id: number) {
  const src = db.select().from(niches).where(eq(niches.id, id)).get();
  if (!src) throw new Error("Niche not found");
  const copy = db
    .insert(niches)
    .values({
      name: `${src.name} (copy)`,
      presetKey: src.presetKey,
      target: src.target,
      playbook: clonePlaybook(src.playbook),
    })
    .returning()
    .get();
  for (const a of db.select().from(areas).where(eq(areas.nicheId, id)).all()) {
    db.insert(areas)
      .values({
        nicheId: copy.id,
        name: a.name,
        shape: a.shape,
        centerLat: a.centerLat,
        centerLng: a.centerLng,
        radiusKm: a.radiusKm,
        polygon: a.polygon ? a.polygon.map((p) => [...p] as [number, number]) : null,
        gridSpacingKm: a.gridSpacingKm,
        queries: [...a.queries],
        num: a.num,
        skipClosedPlaces: a.skipClosedPlaces,
        gl: a.gl,
        hl: a.hl,
      })
      .run();
  }
  revalidatePath("/", "layout");
  return { id: copy.id };
}

export async function deleteNiche(id: number) {
  db.delete(niches).where(eq(niches.id, id)).run();
  revalidatePath("/", "layout");
}

const areaInput = z
  .object({
    name: z.string().trim().min(1, "Name the area"),
    shape: z.enum(["radius", "polygon"]),
    centerLat: z.number().nullable(),
    centerLng: z.number().nullable(),
    radiusKm: z.number().positive().nullable(),
    polygon: z.array(z.tuple([z.number(), z.number()])).nullable(),
    gridSpacingKm: z.number().min(0.5).max(50),
    queries: z.array(z.string().trim().min(1)).min(1, "Add at least one search query"),
    num: z.number().int().min(10).max(500),
    skipClosedPlaces: z.boolean(),
    gl: z.string().length(2),
    hl: z.string().min(2).max(5),
  })
  .transform((v) =>
    // Enforce "radius OR polygon, never both" by clearing the unused side.
    v.shape === "radius"
      ? { ...v, polygon: null }
      : { ...v, centerLat: null, centerLng: null, radiusKm: null },
  )
  .superRefine((v, ctx) => {
    try {
      areaShape(v);
    } catch (e) {
      ctx.addIssue({ code: "custom", message: (e as Error).message });
    }
  });

export async function saveArea(nicheId: number, areaId: number | null, input: z.input<typeof areaInput>) {
  const v = areaInput.parse(input);
  if (areaId) {
    db.update(areas).set(v).where(eq(areas.id, areaId)).run();
    revalidatePath(`/niches/${nicheId}`);
    return { id: areaId };
  }
  const row = db.insert(areas).values({ ...v, nicheId }).returning().get();
  revalidatePath(`/niches/${nicheId}`);
  return { id: row.id };
}

export async function deleteArea(nicheId: number, areaId: number) {
  db.delete(areas).where(eq(areas.id, areaId)).run();
  revalidatePath(`/niches/${nicheId}`);
}

// ---------- outreach ----------

const callInput = z.object({
  nicheId: z.number().int().positive(),
  placeId: z.string().min(1),
  outcome: z.enum(OUTCOMES),
  notes: z.string().max(2000).nullish(),
  objection: z.string().max(200).nullish(),
  offer: z.enum(OFFERS).nullish(),
  followUp: z.string().nullish(), // YYYY-MM-DD from a date input
});

/** Log a call; the stage moves on its own (see stageAfter) and do-not-contact is set when asked. */
export async function logCall(input: z.input<typeof callInput>) {
  const v = callInput.parse(input);
  const result = recordCall({ ...v, followUp: parseFollowUp(v.followUp) });
  revalidatePath("/", "layout");
  return result;
}

/** Manual override, for moves a call can't express (meeting held, proposal sent, won). */
export async function setStage(nicheId: number, placeId: string, stage: (typeof STAGES)[number]) {
  const next = z.enum(STAGES).parse(stage);
  db.update(nichePlaces)
    .set({ stage: next })
    .where(and(eq(nichePlaces.nicheId, nicheId), eq(nichePlaces.placeId, placeId)))
    .run();
  revalidatePath("/", "layout");
}

export async function dismissFollowUp(logId: number) {
  clearFollowUp(logId);
  revalidatePath("/", "layout");
}

export async function deleteCallEntry(logId: number) {
  deleteLogEntry(logId);
  revalidatePath("/", "layout");
}
