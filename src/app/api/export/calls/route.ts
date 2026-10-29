import { csvResponse, stamped, toCsv } from "@/lib/csv";
import { CALL_HEADER, callRows } from "@/lib/export-db";

/** Every logged call as a spreadsheet. */
export async function GET() {
  return csvResponse(stamped("leadfinder-calls", "csv"), toCsv(CALL_HEADER, callRows()));
}
