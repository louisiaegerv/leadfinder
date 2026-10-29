import { syncEnrichment } from "./enrich-db";
import { syncSearch } from "./owner-search-db";
import { db } from "@/db";
import { enrichmentRuns } from "@/db/schema";
import { eq } from "drizzle-orm";

/** One entry point for the poller: a run is either a website read or a web search. */
export async function syncRun(id: number) {
  const run = db.select().from(enrichmentRuns).where(eq(enrichmentRuns.id, id)).get();
  if (!run) return null;
  if (run.kind === "search") return syncSearch(id);
  const done = await syncEnrichment(id);
  return done ? { run: done, fallbackStarted: 0 } : null;
}
