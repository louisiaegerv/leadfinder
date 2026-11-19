import { z } from "zod";
import { updateStyle } from "@/lib/appearance";
import { BLUR_MAX, OVERLAY_MAX, isRegion } from "@/lib/appearance-config";

const body = z.object({
  blur: z.number().min(0).max(BLUR_MAX).optional(),
  overlay: z.number().min(0).max(OVERLAY_MAX).optional(),
});

/** Change how strongly the background is blurred or covered by the theme colour. */
export async function PATCH(req: Request, ctx: { params: Promise<{ region: string }> }) {
  const { region } = await ctx.params;
  if (!isRegion(region)) return Response.json({ error: "Unknown region" }, { status: 404 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Blur must be 0 to 40 and overlay 0 to 100" }, { status: 400 });
  return Response.json(updateStyle(region, parsed.data));
}
