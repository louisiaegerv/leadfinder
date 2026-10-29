import { z } from "zod";
import { findCandidates, resolveTargets, startEnrichment, type Target } from "@/lib/enrich-db";
import { MAX_SEARCH_PER_CLICK } from "@/lib/owner-search";
import { findSearchCandidates, resolveSearchTargets, startOwnerSearch } from "@/lib/owner-search-db";
import { MAX_SCAN_PER_CLICK, findScanCandidates, resolveScanTargets, scanPlaces, startPaidSecondPass } from "@/lib/site-scan-db";
import { parseFilters } from "@/lib/queries";

const common = {
  /** "scan" reads the website directly (free); "search" googles for the owner (cheap); "site" uses the paid website reader. */
  method: z.enum(["scan", "search", "site"]).default("search"),
  /** Search: read the website too when no owner is found. Scan: send sites it couldn't read to the paid reader. */
  fallback: z.boolean().default(false),
};
const body = z.union([
  z.object({ ...common, placeIds: z.array(z.string().min(1)).min(1).max(300) }),
  z.object({
    ...common,
    nicheId: z.number().int().positive(),
    filters: z.record(z.string(), z.string()).default({}),
    limit: z.number().int().min(1).max(300),
  }),
]);

/** Start an owner lookup for specific businesses, or for the top N of what a table filter shows. */
export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Pick at least one business" }, { status: 400 });
  const d = parsed.data;
  const hand = "placeIds" in d;

  try {
    if (d.method === "scan") {
      let ids: string[];
      let skipped: { placeId: string; reason: string }[] = [];
      if (hand) ({ placeIds: ids, skipped } = resolveScanTargets(d.placeIds));
      else ids = findScanCandidates(d.nicheId, parseFilters(d.filters), Math.min(d.limit, MAX_SCAN_PER_CLICK)).placeIds;
      if (ids.length === 0) return Response.json({ error: skipped[0] ? `Nothing to scan: ${skipped[0].reason}` : "Nothing to scan" }, { status: 422 });

      const summary = await scanPlaces(ids);
      let paid: Awaited<ReturnType<typeof startPaidSecondPass>> = null;
      let paidError: string | null = null;
      if (d.fallback && summary.needsBrowser.length > 0) {
        try {
          paid = await startPaidSecondPass(summary.needsBrowser);
        } catch (e) {
          paidError = (e as Error).message; // the scan itself succeeded; say the second pass didn't start
        }
      }
      return Response.json({ ...summary, count: summary.scanned, paidStarted: paid?.count ?? 0, paidEstimatedUsd: paid?.estimatedUsd ?? 0, paidError, skipped });
    }

    if (d.method === "search") {
      let ids: string[];
      let skipped: { placeId: string; reason: string }[] = [];
      if (hand) ({ placeIds: ids, skipped } = resolveSearchTargets(d.placeIds));
      else ids = findSearchCandidates(d.nicheId, parseFilters(d.filters), Math.min(d.limit, MAX_SEARCH_PER_CLICK)).placeIds;
      if (ids.length === 0) return Response.json({ error: skipped[0] ? `Nothing to look up: ${skipped[0].reason}` : "Nothing to look up" }, { status: 422 });
      return Response.json({ ...(await startOwnerSearch(ids, { fallback: d.fallback })), skipped });
    }

    let targets: Target[];
    let skipped: { placeId: string; reason: string }[] = [];
    if (hand) ({ targets, skipped } = resolveTargets(d.placeIds));
    else targets = findCandidates(d.nicheId, parseFilters(d.filters), d.limit).targets;
    if (targets.length === 0) return Response.json({ error: skipped[0] ? `Nothing to enrich: ${skipped[0].reason}` : "Nothing to enrich" }, { status: 422 });
    return Response.json({ ...(await startEnrichment(targets)), skipped });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
