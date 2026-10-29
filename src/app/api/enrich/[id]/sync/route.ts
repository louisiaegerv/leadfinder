import { syncRun } from "@/lib/enrich-sync";

/** Poll Apify for an owner-lookup run; once it has finished, results are applied (idempotent). */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const out = await syncRun(Number(id));
    if (!out) return Response.json({ error: "Run not found" }, { status: 404 });
    const { run, fallbackStarted } = out;
    return Response.json({
      kind: run.kind,
      status: run.status,
      enriched: run.enrichedCount,
      owners: run.ownerCount,
      requested: run.targets.length,
      costUsd: run.costUsd,
      error: run.error,
      fallbackStarted,
    });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
