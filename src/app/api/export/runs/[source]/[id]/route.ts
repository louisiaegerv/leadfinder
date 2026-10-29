import { openDatasetRaw } from "@/lib/apify";
import { findRunDataset } from "@/lib/export-db";

/** Download what Apify returned for one of our runs, untouched. Only datasets this app started can be fetched. */
export async function GET(_req: Request, ctx: { params: Promise<{ source: string; id: string }> }) {
  const { source, id } = await ctx.params;
  const found = findRunDataset(source, Number(id));
  if (!found) return Response.json({ error: "That run has no dataset." }, { status: 404 });

  try {
    const upstream = await openDatasetRaw(found.datasetId);
    return new Response(upstream.body, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${found.name}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not reach Apify";
    const gone = /Apify (404|403)/.test(message);
    return Response.json(
      { error: gone ? "Apify no longer has this dataset. It may have expired; Apify deletes old run data on a schedule that depends on your plan." : message },
      { status: gone ? 404 : 502 },
    );
  }
}
