import { z } from "zod";
import { DEFAULT_LIMIT, MAX_LIMIT, classifyGrayZone, countGray } from "@/lib/graylist";
import { MODEL } from "@/lib/llm";

const body = z.object({ limit: z.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT) });

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return Response.json({ gray: countGray(Number(id)), model: MODEL(), defaultLimit: DEFAULT_LIMIT });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const opts = body.safeParse(await req.json().catch(() => ({})));
  if (!opts.success) return Response.json({ error: opts.error.issues[0].message }, { status: 400 });
  try {
    return Response.json(await classifyGrayZone(Number(id), opts.data.limit));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
