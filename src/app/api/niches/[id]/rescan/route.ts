import { findScansToRefresh, getBackfill, startBackfill } from "@/lib/site-scan-db";

/** How many websites in this niche need reading, and how the background refresh is going. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return Response.json({ pending: findScansToRefresh(Number(id)).length, state: getBackfill(Number(id)) });
}

/** Read the websites that need it in the niche, in the background. Free. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const started = startBackfill(Number(id));
  if (!started) return Response.json({ error: "Nothing to refresh, or a refresh is already running" }, { status: 409 });
  return Response.json({ total: started.total });
}
