import { clearBackground, setBackground } from "@/lib/appearance";
import { ACCEPTED_TYPES, MAX_UPLOAD_BYTES, isRegion } from "@/lib/appearance-config";

type Ctx = { params: Promise<{ region: string }> };

/** Upload a picture as the background. It is resized and converted to WebP before it is stored. */
export async function POST(req: Request, ctx: Ctx) {
  const { region } = await ctx.params;
  if (!isRegion(region)) return Response.json({ error: "Unknown region" }, { status: 404 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Choose an image to upload" }, { status: 400 });
  if (!ACCEPTED_TYPES.includes(file.type)) return Response.json({ error: "Use a JPG, PNG, WebP or AVIF image" }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) return Response.json({ error: `That image is over ${MAX_UPLOAD_BYTES / 1024 / 1024} MB` }, { status: 413 });

  try {
    return Response.json(await setBackground(region, Buffer.from(await file.arrayBuffer())));
  } catch {
    return Response.json({ error: "Could not read that image" }, { status: 400 });
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { region } = await ctx.params;
  if (!isRegion(region)) return Response.json({ error: "Unknown region" }, { status: 404 });
  return Response.json(clearBackground(region));
}
