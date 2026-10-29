import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { areas, contactLog, contacts, enrichmentRuns, facebookProfiles, nichePlaces, niches, places, runs } from "@/db/schema";
import { OFFER_LABEL } from "./offers";
import { STAGE_LABEL } from "./outreach";
import type { Cell } from "./csv";

const offer = (k: keyof typeof OFFER_LABEL | null) => (k ? OFFER_LABEL[k] : "");
const when = (d: Date | null) => (d ? d.toISOString() : "");

export const PROSPECT_HEADER = [
  "Niche", "Business", "Relevance", "Score", "Lead offer", "Runner-up offer", "Stage", "Owner", "Do not contact",
  "Phone", "Website", "Facebook page", "Street", "City", "State", "Postal code", "Rating", "Reviews", "Area", "Google Maps",
];

/** Every business in every niche, with its score and what you know about it. One row per business per niche. */
export function prospectRows(): Cell[][] {
  return db
    .select({
      niche: niches.name,
      title: places.title,
      relevance: nichePlaces.relevance,
      score: nichePlaces.score,
      lead: nichePlaces.leadOffer,
      runnerUp: nichePlaces.runnerUpOffer,
      stage: nichePlaces.stage,
      owner: contacts.ownerName,
      dnc: contacts.doNotContact,
      phone: places.phone,
      website: places.website,
      facebook: facebookProfiles.pageUrl,
      street: places.street,
      city: places.city,
      state: places.state,
      postal: places.postalCode,
      rating: places.totalScore,
      reviews: places.reviewsCount,
      area: areas.name,
      placeId: places.placeId,
    })
    .from(nichePlaces)
    .innerJoin(niches, eq(niches.id, nichePlaces.nicheId))
    .innerJoin(places, eq(places.placeId, nichePlaces.placeId))
    .leftJoin(areas, eq(areas.id, nichePlaces.areaId))
    .leftJoin(contacts, eq(contacts.placeId, nichePlaces.placeId))
    .leftJoin(facebookProfiles, eq(facebookProfiles.placeId, nichePlaces.placeId))
    .orderBy(niches.name, desc(nichePlaces.score), places.title)
    .all()
    .map((r) => [
      r.niche, r.title, r.relevance ?? "undecided", r.score == null ? "" : Math.round(r.score), offer(r.lead), offer(r.runnerUp),
      STAGE_LABEL[r.stage], r.owner, r.dnc ? "yes" : "", r.phone, r.website, r.facebook, r.street, r.city, r.state, r.postal,
      r.rating, r.reviews, r.area, `https://www.google.com/maps/place/?q=place_id:${r.placeId}`,
    ]);
}

export const CALL_HEADER = ["When", "Business", "Phone", "Niche", "Outcome", "Offer pitched", "Objection", "Notes", "Follow up"];

/** Every logged call, newest first. */
export function callRows(): Cell[][] {
  return db
    .select({
      at: contactLog.createdAt,
      title: places.title,
      phone: places.phone,
      niche: niches.name,
      outcome: contactLog.outcome,
      offer: contactLog.offer,
      objection: contactLog.objection,
      notes: contactLog.notes,
      followUp: contactLog.followUp,
    })
    .from(contactLog)
    .innerJoin(places, eq(places.placeId, contactLog.placeId))
    .leftJoin(niches, eq(niches.id, contactLog.nicheId))
    .orderBy(desc(contactLog.createdAt), desc(contactLog.id))
    .all()
    .map((r) => [when(r.at), r.title, r.phone, r.niche, r.outcome, offer(r.offer), r.objection, r.notes, when(r.followUp)]);
}

export type ApifyRunRow = {
  /** Used in the download link: "maps" for area runs, "enrich" for everything else. */
  source: "maps" | "enrich";
  id: number;
  label: string;
  detail: string;
  status: string;
  count: number | null;
  costUsd: number | null;
  apifyRunId: string | null;
  datasetId: string | null;
  at: Date;
};

const ENRICH_LABEL: Record<string, string> = {
  site: "Website reader",
  search: "Owner search",
  facebook: "Facebook search",
  reviews: "Review fetch",
};

/** Every Apify run this app started, newest first: area scrapes and the paid enrichment runs. */
export function listApifyRuns(limit = 200): ApifyRunRow[] {
  const maps = db
    .select({ run: runs, area: areas.name, niche: niches.name })
    .from(runs)
    .innerJoin(areas, eq(areas.id, runs.areaId))
    .innerJoin(niches, eq(niches.id, areas.nicheId))
    .orderBy(desc(runs.id))
    .limit(limit)
    .all()
    .map(({ run, area, niche }): ApifyRunRow => ({
      source: "maps",
      id: run.id,
      label: "Google Maps scrape",
      detail: `${niche}, ${area}`,
      status: run.status,
      count: run.resultCount,
      costUsd: run.costUsd,
      apifyRunId: run.apifyRunId,
      datasetId: run.datasetId,
      at: run.createdAt,
    }));
  const enrich = db
    .select()
    .from(enrichmentRuns)
    .orderBy(desc(enrichmentRuns.id))
    .limit(limit)
    .all()
    .map((r): ApifyRunRow => ({
      source: "enrich",
      id: r.id,
      label: ENRICH_LABEL[r.kind] ?? r.kind,
      detail: `${r.targets.length} ${r.targets.length === 1 ? "business" : "businesses"}`,
      status: r.status,
      count: r.enrichedCount,
      costUsd: r.costUsd,
      apifyRunId: r.apifyRunId,
      datasetId: r.datasetId,
      at: r.createdAt,
    }));
  return [...maps, ...enrich].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}

/** The dataset behind one of our runs, or null. Only datasets this app started can be fetched. */
export function findRunDataset(source: string, id: number): { datasetId: string; name: string } | null {
  if (source === "maps") {
    const r = db.select().from(runs).where(eq(runs.id, id)).get();
    return r?.datasetId ? { datasetId: r.datasetId, name: `apify-maps-run-${id}.json` } : null;
  }
  if (source === "enrich") {
    const r = db.select().from(enrichmentRuns).where(eq(enrichmentRuns.id, id)).get();
    return r?.datasetId ? { datasetId: r.datasetId, name: `apify-${r.kind}-run-${id}.json` } : null;
  }
  return null;
}

/** A consistent, compacted copy of the whole database in a temp folder. Call the returned cleanup when done. */
export function makeBackup(): { file: string; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "leadfinder-backup-"));
  const file = path.join(dir, "leadfinder.db");
  try {
    // VACUUM INTO writes a snapshot while the app keeps running; the path is ours, but quote it anyway.
    db.$client.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  } catch (e) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw e;
  }
  return { file, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}
