import { csvResponse, stamped, toCsv } from "@/lib/csv";
import { PROSPECT_HEADER, prospectRows } from "@/lib/export-db";

/** Every business in every niche as a spreadsheet. */
export async function GET() {
  return csvResponse(stamped("leadfinder-prospects", "csv"), toCsv(PROSPECT_HEADER, prospectRows()));
}
