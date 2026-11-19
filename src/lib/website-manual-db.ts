import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { enrichment, nichePlaces, pageTexts, places } from "@/db/schema";
import { reclassifyNiche, rescoreNiche } from "./rescore";
import { parseManualWebsite } from "./website-manual";

/**
 * Type in (or fix) a business's website, for one that is not on its Google listing. A website you set is kept
 * when Google Maps is searched again. A different site means what was read from the old one (the scan, the page text and
 * the paid reader's result) no longer applies, so it is dropped; owners and Facebook pages already found are kept.
 * Empty clears the site. Throws if the text is not a website.
 */
export function setManualWebsite(placeId: string, input: string | null): { website: string | null; domain: string | null } {
  const site = parseManualWebsite(input);
  const existing = db.select({ website: places.website }).from(places).where(eq(places.placeId, placeId)).get();
  if (!existing) throw new Error("Business not found");

  db.transaction((tx) => {
    tx.update(places)
      .set({ website: site?.website ?? null, domain: site?.domain ?? null, websiteManual: site !== null })
      .where(eq(places.placeId, placeId))
      .run();
    if ((existing.website ?? null) !== (site?.website ?? null)) {
      tx.delete(enrichment).where(and(eq(enrichment.placeId, placeId), inArray(enrichment.kind, ["site_scan", "profile"]))).run();
      tx.delete(pageTexts).where(eq(pageTexts.placeId, placeId)).run();
    }
  });

  // The site feeds relevance (its domain and text) and the score, in every niche that tracks the business.
  for (const n of db.selectDistinct({ id: nichePlaces.nicheId }).from(nichePlaces).where(eq(nichePlaces.placeId, placeId)).all()) {
    reclassifyNiche(n.id);
    rescoreNiche(n.id);
  }
  return { website: site?.website ?? null, domain: site?.domain ?? null };
}
