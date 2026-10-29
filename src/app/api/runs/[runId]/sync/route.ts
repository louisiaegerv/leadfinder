import { eq } from "drizzle-orm";
import { db } from "@/db";
import { runs } from "@/db/schema";
import { fetchDataset, getRun, TERMINAL } from "@/lib/apify";
import { ingestItems } from "@/lib/ingest";
import { startAutoScan } from "@/lib/site-scan-db";

const STATUS_MAP: Record<string, "running" | "succeeded" | "failed" | "aborted"> = {
  READY: "running",
  RUNNING: "running",
  "TIMING-OUT": "running",
  ABORTING: "running",
  SUCCEEDED: "succeeded",
  FAILED: "failed",
  "TIMED-OUT": "failed",
  ABORTED: "aborted",
};

/** Poll Apify for the run; once it succeeds, fetch the dataset and ingest it (idempotent). */
export async function POST(_req: Request, ctx: { params: Promise<{ runId: string }> }) {
  const { runId } = await ctx.params;
  const id = Number(runId);
  const run = db.select().from(runs).where(eq(runs.id, id)).get();
  if (!run) return Response.json({ error: "Run not found" }, { status: 404 });
  if (run.status === "ingested" || !run.apifyRunId) return Response.json({ run });

  try {
    const remote = await getRun(run.apifyRunId);
    const status = STATUS_MAP[remote.status] ?? "running";
    const patch = {
      status,
      datasetId: remote.defaultDatasetId ?? run.datasetId,
      costUsd: remote.usageTotalUsd ?? run.costUsd,
      finishedAt: TERMINAL.has(remote.status) ? new Date(remote.finishedAt ?? Date.now()) : null,
      error: status === "failed" ? (remote.statusMessage ?? `Apify status ${remote.status}`) : null,
    };
    db.update(runs).set(patch).where(eq(runs.id, id)).run();

    if (status === "succeeded" && patch.datasetId) {
      const items = await fetchDataset(patch.datasetId);
      ingestItems(id, items);
      startAutoScan(id); // free quick scan of the new websites, in the background
    }
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
  return Response.json({ run: db.select().from(runs).where(eq(runs.id, id)).get() });
}
