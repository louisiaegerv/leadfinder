import { eq } from "drizzle-orm";
import { db } from "@/db";
import { facebookProfiles, nichePlaces, places } from "@/db/schema";
import { parseManualFacebook } from "./facebook-search";
import { rescoreNiche } from "./rescore";

/**
 * Type in (or fix) a business's Facebook page. A page you set is marked as yours with full confidence, so no search
 * or website scan will replace it. Changing the page forgets any ad check made on the old one. Empty clears the page
 * and forgets where it came from, so a later search can fill it in. Throws if the text is not a Facebook page.
 */
export function setManualFacebook(placeId: string, url: string | null, pageId: string | null): { pageUrl: string | null; pageId: string | null } {
  const page = parseManualFacebook(url, pageId);
  if (!db.select({ id: places.placeId }).from(places).where(eq(places.placeId, placeId)).get()) throw new Error("Business not found");
  const existing = db.select().from(facebookProfiles).where(eq(facebookProfiles.placeId, placeId)).get();

  if (!page) {
    if (existing) {
      db.update(facebookProfiles)
        .set({ pageUrl: null, pageId: null, matchSource: null, matchConfidence: null, userOverride: false, state: null, adLibrary: null, checkedAt: null })
        .where(eq(facebookProfiles.placeId, placeId))
        .run();
    }
  } else if (!existing) {
    db.insert(facebookProfiles).values({ placeId, pageUrl: page.url, pageId: page.pageId, matchSource: "user", matchConfidence: 1, userOverride: true }).run();
  } else {
    const changed = existing.pageUrl !== page.url || existing.pageId !== page.pageId;
    db.update(facebookProfiles)
      .set({
        pageUrl: page.url,
        pageId: page.pageId,
        matchSource: "user",
        matchConfidence: 1,
        userOverride: true,
        ...(changed ? { state: null, adLibrary: null, checkedAt: null } : {}),
      })
      .where(eq(facebookProfiles.placeId, placeId))
      .run();
  }

  // Whether a business has a page feeds its score, in every niche that tracks it.
  for (const n of db.selectDistinct({ id: nichePlaces.nicheId }).from(nichePlaces).where(eq(nichePlaces.placeId, placeId)).all()) rescoreNiche(n.id);
  return { pageUrl: page?.url ?? null, pageId: page?.pageId ?? null };
}
