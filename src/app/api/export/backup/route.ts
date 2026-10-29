import fs from "node:fs";
import { stamped } from "@/lib/csv";
import { makeBackup } from "@/lib/export-db";

/** Download the whole database (businesses, scores, owners, call log) as one SQLite file. */
export async function GET() {
  let backup: ReturnType<typeof makeBackup>;
  try {
    backup = makeBackup();
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Backup failed" }, { status: 500 });
  }
  try {
    const bytes = fs.readFileSync(backup.file);
    return new Response(bytes, {
      headers: {
        "Content-Type": "application/vnd.sqlite3",
        "Content-Disposition": `attachment; filename="${stamped("leadfinder", "db")}"`,
        "Content-Length": String(bytes.length),
        "Cache-Control": "no-store",
      },
    });
  } finally {
    backup.cleanup();
  }
}
