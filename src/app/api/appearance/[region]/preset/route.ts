import { z } from "zod";
import { setPreset } from "@/lib/appearance";
import { isPresetId, isRegion } from "@/lib/appearance-config";

const body = z.object({ id: z.string().refine(isPresetId) });

/** Use one of the bundled backgrounds. */
export async function POST(req: Request, ctx: { params: Promise<{ region: string }> }) {
  const { region } = await ctx.params;
  if (!isRegion(region)) return Response.json({ error: "Unknown region" }, { status: 404 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !isPresetId(parsed.data.id)) return Response.json({ error: "Unknown preset" }, { status: 400 });
  return Response.json(setPreset(region, parsed.data.id));
}
