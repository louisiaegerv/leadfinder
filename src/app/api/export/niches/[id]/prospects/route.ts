import { csvResponse, stamped, toCsv } from "@/lib/csv";
import { PROSPECT_HEADER, prospectRows } from "@/lib/export-db";
import { getNiche, parseFilters } from "@/lib/queries";

/** The businesses a niche's Prospects table matches for the same filters in the URL, as a spreadsheet. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const niche = getNiche(Number(id));
  if (!niche) return Response.json({ error: "Niche not found" }, { status: 404 });
  const filters = parseFilters(Object.fromEntries(new URL(req.url).searchParams));
  const name = niche.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "niche";
  return csvResponse(stamped(`leadfinder-${name}-prospects`, "csv"), toCsv(PROSPECT_HEADER, prospectRows({ nicheId: niche.id, filters })));
}
