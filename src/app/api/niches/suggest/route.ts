import { suggestInput, suggestNiche } from "@/lib/niche-suggest";

/** Ask the model to fill in a new niche from its name. Saves nothing. */
export async function POST(req: Request) {
  const input = suggestInput.safeParse(await req.json().catch(() => ({})));
  if (!input.success) return Response.json({ error: input.error.issues[0].message }, { status: 400 });
  try {
    return Response.json(await suggestNiche(input.data));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
