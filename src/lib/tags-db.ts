import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { nichePlaces, places } from "@/db/schema";
import { nicheFilterWhere, type PlaceFilters } from "./queries";
import { cleanTag, withoutTag, withTag } from "./tags";

/**
 * Add a tag to (or take it off) every business the niche's Prospects table matches for these filters: all pages, not
 * just the one on screen. Tags belong to the business within this niche. Throws if the tag is empty.
 */
export function tagMatching(
  nicheId: number,
  filters: PlaceFilters,
  rawTag: string,
  mode: "add" | "remove",
): { matched: number; changed: number; tag: string } {
  const tag = cleanTag(rawTag);
  if (!tag) throw new Error("Type a tag first");
  return db.transaction((tx) => {
    const rows = tx
      .select({ placeId: nichePlaces.placeId, tags: nichePlaces.tags })
      .from(nichePlaces)
      .innerJoin(places, eq(places.placeId, nichePlaces.placeId))
      .where(nicheFilterWhere(nicheId, filters))
      .all();
    let changed = 0;
    for (const r of rows) {
      const next = mode === "add" ? withTag(r.tags, tag) : withoutTag(r.tags, tag);
      if (next === (r.tags ?? [])) continue; // helpers hand back the same array when nothing changes
      tx.update(nichePlaces)
        .set({ tags: next.length ? next : null })
        .where(and(eq(nichePlaces.nicheId, nicheId), eq(nichePlaces.placeId, r.placeId)))
        .run();
      changed++;
    }
    return { matched: rows.length, changed, tag };
  });
}

/** Every tag used in a niche, with how many businesses carry it, most used first. */
export function nicheTags(nicheId: number): { tag: string; n: number }[] {
  return db.$client
    .prepare(
      `select min(j.value) as tag, count(*) as n
       from niche_places np, json_each(np.tags) j
       where np.niche_id = ? and np.tags is not null
       group by lower(j.value)
       order by n desc, lower(j.value)`,
    )
    .all(nicheId) as { tag: string; n: number }[];
}
