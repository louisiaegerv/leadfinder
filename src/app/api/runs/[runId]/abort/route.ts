import { eq } from "drizzle-orm";
import { db } from "@/db";
import { runs } from "@/db/schema";
import { abortRun } from "@/lib/apify";

export async function POST(_req: Request, ctx: { params: Promise<{ runId: string }> }) {
  const { runId } = await ctx.params;
  const run = db.select().from(runs).where(eq(runs.id, Number(runId))).get();
  if (!run?.apifyRunId) return Response.json({ error: "Run not found" }, { status: 404 });
  try {
    await abortRun(run.apifyRunId);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
  return Response.json({ ok: true });
}
