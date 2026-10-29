import { ENRICH_PRICE_USD, MAX_PER_RUN, maxBusinessesForCap } from "@/lib/enrich";
import { findCandidates } from "@/lib/enrich-db";
import { RUN_COST_CAP_USD } from "@/lib/apify";
import { MAX_SEARCH_PER_CLICK, SEARCH_PER_BUSINESS_USD } from "@/lib/owner-search";
import { findSearchCandidates } from "@/lib/owner-search-db";
import { MAX_SCAN_PER_CLICK, findScanCandidates } from "@/lib/site-scan-db";
import { parseFilters } from "@/lib/queries";

/** What a bulk lookup would cover for the current table filters and chosen method, and what it would cost. */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const nicheId = Number(params.get("niche"));
  if (!Number.isInteger(nicheId) || nicheId <= 0) return Response.json({ error: "Missing niche" }, { status: 400 });
  const filters = parseFilters(Object.fromEntries(params));

  if (params.get("method") === "scan") {
    const { stats } = findScanCandidates(nicheId, filters, 0);
    return Response.json({
      ...stats,
      inProgress: 0,
      withWebsite: stats.eligible,
      maxPerClick: MAX_SCAN_PER_CLICK,
      pricePerBusiness: 0,
      fallbackPrice: ENRICH_PRICE_USD,
    });
  }

  if (params.get("method") === "site") {
    const { stats } = findCandidates(nicheId, filters, 0);
    return Response.json({
      matching: stats.matching,
      eligible: stats.eligible,
      alreadyDone: stats.alreadyEnriched,
      noWebsite: stats.noWebsite,
      doNotContact: stats.doNotContact,
      inProgress: stats.inProgress,
      withWebsite: stats.eligible,
      maxPerClick: Math.min(MAX_PER_RUN, maxBusinessesForCap(RUN_COST_CAP_USD())),
      pricePerBusiness: ENRICH_PRICE_USD,
      fallbackPrice: 0,
    });
  }

  const { stats } = findSearchCandidates(nicheId, filters, 0);
  return Response.json({
    ...stats,
    noWebsite: 0,
    maxPerClick: MAX_SEARCH_PER_CLICK,
    pricePerBusiness: SEARCH_PER_BUSINESS_USD,
    fallbackPrice: ENRICH_PRICE_USD,
  });
}
