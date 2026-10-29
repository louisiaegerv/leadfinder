import { Database, Download, ExternalLink, FileSpreadsheet, History } from "lucide-react";
import { FadeIn } from "@/components/fade-in";
import { Badge } from "@/components/ui/badge";
import { listApifyRuns } from "@/lib/export-db";
import { cn } from "@/lib/utils";

export const metadata = { title: "Data · Leadfinder" };

const btn = "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted";
const small = "inline-flex items-center gap-1 whitespace-nowrap text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline";

const money = (n: number | null) => (n == null ? "–" : `$${n.toFixed(n < 0.1 ? 4 : 2)}`);

export default function DataPage() {
  const runs = listApifyRuns();
  return (
    <FadeIn className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Data</h1>
        <p className="text-sm text-muted-foreground">Back up your database, take your lists to a spreadsheet, and get at what Apify returned.</p>
      </div>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Database className="size-5" /> Backup</h2>
        <div className="space-y-3 rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">
            Everything you have built here (businesses, scores, owners, call notes and follow-ups) lives in one file on this computer. Download a copy now and then,
            and before you update the app. The app keeps running while it is copied.
          </p>
          <a href="/api/export/backup" className={btn}><Download className="size-4" /> Download backup</a>
          <p className="text-xs text-muted-foreground">
            To restore: stop the app, replace <code className="rounded bg-muted px-1">data/leadfinder.db</code> with the downloaded file (rename it to match), delete{" "}
            <code className="rounded bg-muted px-1">leadfinder.db-wal</code> and <code className="rounded bg-muted px-1">leadfinder.db-shm</code> beside it if they exist, then start the app.
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><FileSpreadsheet className="size-5" /> Spreadsheets</h2>
        <div className="space-y-3 rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">CSV files that open in Excel or Google Sheets.</p>
          <div className="flex flex-wrap gap-2">
            <a href="/api/export/prospects" className={btn}><Download className="size-4" /> Prospects</a>
            <a href="/api/export/calls" className={btn}><Download className="size-4" /> Call log</a>
          </div>
          <p className="text-xs text-muted-foreground">
            Prospects has one row per business per niche, with relevance, score, offers, stage, owner, contact details and Facebook page. Noise and do-not-contact rows are
            included and marked, so filter them in the sheet.
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><History className="size-5" /> Apify runs</h2>
        <p className="text-sm text-muted-foreground">
          Every run this app has started. <b>Raw data</b> downloads exactly what Apify returned, before this app read it. <b>Apify</b> opens the run in your Apify console, where
          you can also see its input, log and charges. Apify deletes old run data after a while, so download anything you want to keep.
        </p>
        {runs.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No runs yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">When</th>
                  <th className="px-3 py-2">Run</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Items</th>
                  <th className="px-3 py-2 text-right">Cost</th>
                  <th className="px-3 py-2">Data</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={`${r.source}-${r.id}`} className="border-t align-top">
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">
                      {r.at.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      <br />
                      {r.at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium whitespace-nowrap">{r.label}</div>
                      <div className="text-xs text-muted-foreground">{r.detail}</div>
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={r.status === "failed" ? "destructive" : r.status === "ingested" ? "secondary" : "outline"}>{r.status}</Badge>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.count ?? "–"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(r.costUsd)}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col gap-1">
                        {r.datasetId && (
                          <a href={`/api/export/runs/${r.source}/${r.id}`} className={cn(small)}>
                            <Download className="size-3" /> Raw data (JSON)
                          </a>
                        )}
                        {r.apifyRunId && (
                          <a href={`https://console.apify.com/actors/runs/${encodeURIComponent(r.apifyRunId)}`} target="_blank" rel="noreferrer" className={small}>
                            <ExternalLink className="size-3" /> Apify
                          </a>
                        )}
                        {!r.datasetId && !r.apifyRunId && <span className="text-xs text-muted-foreground">–</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </FadeIn>
  );
}
