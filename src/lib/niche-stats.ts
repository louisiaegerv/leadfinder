import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { contacts, enrichment, facebookProfiles, nichePlaces, places } from "@/db/schema";
import { getRelevanceCounts } from "./queries";
import { websiteKind } from "./scoring";

export type NicheStats = {
  relevance: ReturnType<typeof getRelevanceCounts>;
  /** The businesses the coverage numbers are about: everything not ruled out as noise. */
  prospects: number;
  noWebsite: number;
  /** Has only a Facebook, Instagram or similar page where a website would be. */
  socialOnly: number;
  /** Own website that did not load when scanned. Only scanned sites can be known to be broken. */
  brokenWebsite: number;
  /** Prospects with their own website whose scan has run, so the broken count has context. */
  scanned: number;
  withFacebook: number;
  withOwner: number;
};

/** The numbers shown on the niche overview: how the businesses sort out, and how much we know about the ones still in play. */
export function getNicheStats(nicheId: number): NicheStats {
  const rows = db
    .select({
      domain: places.domain,
      website: places.website,
      facebook: facebookProfiles.pageUrl,
      owner: contacts.ownerName,
      outcome: sql<string | null>`json_extract(${enrichment.data}, '$.outcome')`,
    })
    .from(nichePlaces)
    .innerJoin(places, eq(places.placeId, nichePlaces.placeId))
    .leftJoin(facebookProfiles, eq(facebookProfiles.placeId, nichePlaces.placeId))
    .leftJoin(contacts, eq(contacts.placeId, nichePlaces.placeId))
    .leftJoin(enrichment, and(eq(enrichment.placeId, nichePlaces.placeId), eq(enrichment.kind, "site_scan")))
    .where(and(eq(nichePlaces.nicheId, nicheId), sql`(${nichePlaces.relevance} is null or ${nichePlaces.relevance} != 'noise')`))
    .all();

  const s = { noWebsite: 0, socialOnly: 0, brokenWebsite: 0, scanned: 0, withFacebook: 0, withOwner: 0 };
  for (const r of rows) {
    const kind = websiteKind(r.domain, r.website);
    if (kind === "none") s.noWebsite++;
    else if (kind === "social") s.socialOnly++;
    else if (r.outcome) {
      s.scanned++;
      if (r.outcome === "dead") s.brokenWebsite++;
    }
    if (r.facebook) s.withFacebook++;
    if (r.owner?.trim()) s.withOwner++;
  }
  return { relevance: getRelevanceCounts(nicheId), prospects: rows.length, ...s };
}
