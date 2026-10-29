import { db } from "@/db";
import { places } from "@/db/schema";
import { playbookSchema } from "@/lib/playbook";
import { classifyByRules } from "@/lib/relevance";

/**
 * Free preview: how many already-scraped places match a (draft) playbook.
 * Pure local read, no Apify or LLM spend.
 */
export async function POST(req: Request) {
  const parsed = playbookSchema.safeParse((await req.json()).playbook);
  if (!parsed.success) return Response.json({ error: "Invalid playbook" }, { status: 400 });
  const pb = parsed.data;

  const all = db
    .select({ title: places.title, categories: places.categories, domain: places.domain })
    .from(places)
    .all();

  const counts = { target: 0, adjacent: 0, noise: 0, gray: 0 };
  const samples: string[] = [];
  for (const p of all) {
    const r = classifyByRules(p, pb);
    if (r.label === null) counts.gray++;
    else counts[r.label]++;
    if (r.label === "target" && samples.length < 6) samples.push(p.title);
  }
  return Response.json({ total: all.length, ...counts, samples });
}
