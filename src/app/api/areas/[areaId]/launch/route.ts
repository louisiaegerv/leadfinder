import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { areas, runs } from "@/db/schema";
import { areaShape } from "@/lib/areas";
import { buildMapsInput, PLAN, RUN_COST_CAP_USD, startRun } from "@/lib/apify";
import { estimateCostUsd, estimateResults, estimateSeconds, gridPoints } from "@/lib/geo";
import { savePostRunOptions } from "@/lib/post-run";

// Optional overrides; anything omitted falls back to the values saved on the area.
const body = z.object({
  num: z.number().int().min(10).max(500).optional(),
  skipClosedPlaces: z.boolean().optional(),
  gl: z.string().length(2).optional(),
  hl: z.string().min(2).max(5).optional(),
  reviews: z.boolean().optional(),
  maxReviews: z.number().int().min(1).max(50).optional(),
  searchOwners: z.boolean().optional(),
  searchFacebook: z.boolean().optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ areaId: string }> }) {
  const { areaId } = await ctx.params;
  const area = db.select().from(areas).where(eq(areas.id, Number(areaId))).get();
  if (!area) return Response.json({ error: "Area not found" }, { status: 404 });

  const opts = body.safeParse(await req.json().catch(() => ({})));
  if (!opts.success) return Response.json({ error: opts.error.issues[0].message }, { status: 400 });

  let shape;
  try {
    shape = areaShape(area);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }

  const setup = {
    num: opts.data.num ?? area.num,
    skipClosedPlaces: opts.data.skipClosedPlaces ?? area.skipClosedPlaces,
    gl: opts.data.gl ?? area.gl,
    hl: opts.data.hl ?? area.hl,
    reviews: opts.data.reviews ?? area.reviews,
    maxReviews: opts.data.maxReviews ?? area.maxReviews,
  };
  const reviewsPerPlace = setup.reviews ? setup.maxReviews : 0;
  const points = gridPoints(shape, area.gridSpacingKm).length;
  const est = estimateResults({ points, queries: area.queries.length, num: setup.num });
  const plan = PLAN();
  const maxCost = estimateCostUsd(est.max, plan, reviewsPerPlace);
  const cap = RUN_COST_CAP_USD();

  const input = buildMapsInput({
    queries: area.queries,
    shape,
    gridSpacingKm: area.gridSpacingKm,
    ...setup,
  });

  try {
    // Apify enforces the cap too, so a runaway run can never exceed it.
    const started = await startRun(input, cap);
    const run = db
      .insert(runs)
      .values({
        areaId: area.id,
        kind: "full",
        apifyRunId: started.id,
        datasetId: started.defaultDatasetId,
        inputs: input,
        status: "running",
        estimatedPoints: points,
        estimatedCostUsd: estimateCostUsd(est.likely, plan, reviewsPerPlace),
        startedAt: new Date(),
      })
      .returning()
      .get();
    // Remember what was ticked for this run, so the searches follow once its places are in.
    savePostRunOptions(run.id, {
      searchOwners: opts.data.searchOwners ?? area.searchOwners,
      searchFacebook: opts.data.searchFacebook ?? area.searchFacebook,
    });
    return Response.json({
      run,
      estimate: { points, seconds: estimateSeconds(points), likelyResults: est.likely, maxCostUsd: maxCost, capUsd: cap },
    });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
