import fs from "node:fs";
import { resolveUpload } from "@/lib/appearance";

/** Serve an uploaded background. Only our own generated file names resolve, so nothing outside the folder can be asked for. */
export async function GET(_req: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  const p = resolveUpload(file);
  if (!p || !fs.existsSync(p)) return new Response("Not found", { status: 404 });
  return new Response(fs.readFileSync(p), {
    // Every upload gets a fresh random name, so a given URL never changes and can be cached for good.
    headers: { "Content-Type": "image/webp", "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
