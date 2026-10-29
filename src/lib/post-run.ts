import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { contacts, enrichment, facebookProfiles, placeRuns, settings } from "@/db/schema";
import { placesInFlight } from "./enrich-db";
import { startFacebookSearch } from "./facebook-search-db";
import { MAX_SEARCH_PER_CLICK } from "./owner-search";
import { startOwnerSearch } from "./owner-search-db";

/**
 * The paid searches you can tick on a run: they start by themselves once the run's places are in, for the
 * places that still need them. Off unless chosen, since each costs money. (The free website scan is separate
 * and always runs.)
 */
export type PostRunOptions = { searchOwners: boolean; searchFacebook: boolean };
export type PostRunState = PostRunOptions & {
  /** Set once the searches have been started, with how many businesses each covers. */
  started?: { owners: number; facebook: number };
  errors?: string[];
};

/** Most businesses each automatic search covers per run, the same limit as one click on Enrich. */
export const MAX_AUTO_SEARCH = MAX_SEARCH_PER_CLICK;

const key = (runId: number) => `postrun:${runId}`;

/** Remember what was ticked when the run was launched, so changing the area later doesn't change what this run does. */
export function savePostRunOptions(runId: number, opts: PostRunOptions): void {
  if (!opts.searchOwners && !opts.searchFacebook) return;
  const value: PostRunState = { searchOwners: opts.searchOwners, searchFacebook: opts.searchFacebook };
  db.insert(settings).values({ key: key(runId), value }).onConflictDoUpdate({ target: settings.key, set: { value } }).run();
}

export function getPostRun(runId: number): PostRunState | null {
  const row = db.select().from(settings).where(eq(settings.key, key(runId))).get();
  return (row?.value as PostRunState | undefined) ?? null;
}

/** Places this run surfaced that still need an owner search or a Facebook page, skipping do-not-contact and anything already done. */
export function placesNeeding(runId: number): { owners: string[]; facebook: string[] } {
  const ids = db.selectDistinct({ id: placeRuns.placeId }).from(placeRuns).where(eq(placeRuns.runId, runId)).all().map((r) => r.id);
  const owners: string[] = [];
  const facebook: string[] = [];
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const contact = new Map(db.select().from(contacts).where(inArray(contacts.placeId, chunk)).all().map((c) => [c.placeId, c]));
    const page = new Map(db.select().from(facebookProfiles).where(inArray(facebookProfiles.placeId, chunk)).all().map((f) => [f.placeId, f.pageUrl]));
    const done = db
      .select({ placeId: enrichment.placeId, kind: enrichment.kind })
      .from(enrichment)
      .where(and(inArray(enrichment.placeId, chunk), inArray(enrichment.kind, ["owner_search", "facebook_search"])))
      .all();
    const searchedOwner = new Set(done.filter((d) => d.kind === "owner_search").map((d) => d.placeId));
    const searchedFb = new Set(done.filter((d) => d.kind === "facebook_search").map((d) => d.placeId));

    for (const id of chunk) {
      const c = contact.get(id);
      if (c?.doNotContact) continue;
      const goodOwner = !!c?.ownerName && (c.source === "manual" || (c.confidence ?? 0) >= 0.8);
      if (!searchedOwner.has(id) && !goodOwner) owners.push(id);
      if (!searchedFb.has(id) && !page.get(id)) facebook.push(id);
    }
  }
  return { owners, facebook };
}

/**
 * Start whichever searches were ticked for this run. Safe to call twice (it starts once), and a failure here
 * is recorded rather than thrown: the run itself has already finished.
 */
export async function startPostRunSearches(runId: number): Promise<PostRunState | null> {
  const state = getPostRun(runId);
  if (!state || state.started || (!state.searchOwners && !state.searchFacebook)) return state;

  const need = placesNeeding(runId);
  const busy = placesInFlight(); // already being searched by an earlier run: don't pay twice
  const pick = (ids: string[]) => ids.filter((id) => !busy.has(id)).slice(0, MAX_AUTO_SEARCH);
  const owners = state.searchOwners ? pick(need.owners) : [];
  const facebook = state.searchFacebook ? pick(need.facebook) : [];

  const started = { owners: 0, facebook: 0 };
  const errors: string[] = [];
  if (owners.length > 0) {
    try {
      // The website fallback is never automatic: it is a second purchase you make by hand.
      started.owners = (await startOwnerSearch(owners, { fallback: false })).count;
    } catch (e) {
      errors.push(`Owner search: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (facebook.length > 0) {
    try {
      started.facebook = (await startFacebookSearch(facebook)).count;
    } catch (e) {
      errors.push(`Facebook search: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const next: PostRunState = { ...state, started, ...(errors.length ? { errors } : {}) };
  db.insert(settings).values({ key: key(runId), value: next }).onConflictDoUpdate({ target: settings.key, set: { value: next } }).run();
  return next;
}
