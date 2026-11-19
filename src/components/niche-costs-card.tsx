import { AnimatedBar } from "@/components/animated-bar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { NicheCosts } from "@/lib/niche-costs";

const money = (n: number) => `$${n.toFixed(n < 0.1 ? 4 : 2)}`;

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border bg-card/50 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function NicheCostsCard({ costs }: { costs: NicheCosts }) {
  const { totalUsd, prospects, targets } = costs;
  const biggest = Math.max(...costs.lines.map((l) => l.costUsd), 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Costs</CardTitle>
        <CardDescription>What this niche has cost so far, from Apify and the model.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Total" value={money(totalUsd)} sub={costs.inFlightUsd > 0 ? `+ ~${money(costs.inFlightUsd)} still running` : undefined} />
          <Stat label="Scraping" value={money(costs.scrapeUsd)} sub="Google Maps runs" />
          <Stat label="Enrichment" value={money(costs.enrichmentUsd)} sub="Websites, owners, Facebook" />
          <Stat label="Reviews" value={money(costs.reviewsUsd)} sub="Review fetch runs" />
        </div>

        <ul className="space-y-3">
          {costs.lines.map((l, i) => (
            <li key={l.key}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium" title={l.hint}>
                  {l.label} <span className="font-normal text-muted-foreground">· {l.count} {l.key === "relevance" ? (l.count === 1 ? "business" : "businesses") : l.count === 1 ? "run" : "runs"}</span>
                </span>
                <span className="tabular-nums">{money(l.costUsd)}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                <AnimatedBar pct={biggest > 0 ? (l.costUsd / biggest) * 100 : 0} delay={i * 0.05} />
              </div>
            </li>
          ))}
        </ul>

        <div className="grid grid-cols-2 gap-3 border-t pt-4 sm:grid-cols-3">
          <Stat label="Per prospect" value={prospects > 0 ? money(totalUsd / prospects) : "–"} sub={`${prospects} not ruled out`} />
          <Stat label="Per target" value={targets > 0 ? money(totalUsd / targets) : "–"} sub={`${targets} targets`} />
          <Stat label="Per 100 prospects" value={prospects > 0 ? money((totalUsd / prospects) * 100) : "–"} />
        </div>

        <p className="text-xs text-muted-foreground">
          Owner search and Facebook search include the model&apos;s cost. A run that covered businesses from several niches is split by how many belong to this one
          {costs.sharedRuns > 0 ? ` (${costs.sharedRuns} here)` : ""}. AI relevance checks are matched from saved results, so checks made before the niche was last edited are not counted.
        </p>
      </CardContent>
    </Card>
  );
}
