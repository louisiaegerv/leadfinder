import Link from "next/link";
import { notFound } from "next/navigation";
import { Map as MapIcon, MapPinned, Plus, Settings2, Table2 } from "lucide-react";
import { FadeIn } from "@/components/fade-in";
import { NicheActions } from "@/components/niche-actions";
import { NicheCostsCard } from "@/components/niche-costs-card";
import { NicheListFilters } from "@/components/niche-list-filters";
import { NicheStatsCard } from "@/components/niche-stats-card";
import { ScanRefreshCard } from "@/components/scan-refresh-card";
import { Pager } from "@/components/pager";
import { RunList, type RunRow } from "@/components/run-list";
import { getAreaPlaceCounts, getAreas, getNiche, getRuns } from "@/lib/queries";
import { getNicheCosts } from "@/lib/niche-costs";
import { getNicheStats } from "@/lib/niche-stats";
import { isLiveRun, matchesRunStatus, paginate, parseNicheView, type NicheTab } from "@/lib/niche-view";
import { getPostRun } from "@/lib/post-run";
import { findScansToRefresh, getAutoScan, getBackfill } from "@/lib/site-scan-db";
import { areaShape } from "@/lib/areas";
import { gridPoints, polygonAreaKm2 } from "@/lib/geo";
import { cn } from "@/lib/utils";
import { withParams } from "@/lib/url";

const btn = "inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted";
const money = (n: number) => `$${n.toFixed(n < 0.1 ? 3 : 2)}`;
const day = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function NichePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { id } = await params;
  const sp = await searchParams;
  const niche = getNiche(Number(id));
  if (!niche) notFound();
  const view = parseNicheView(sp);
  const base = `/niches/${niche.id}`;
  const areas = getAreas(niche.id);
  const allRuns = getRuns(niche.id).map(({ run, areaName }) => ({
    areaId: run.areaId,
    createdAt: run.createdAt,
    row: {
      id: run.id,
      areaName,
      status: run.status,
      resultCount: run.resultCount,
      newPlaceCount: run.newPlaceCount,
      costUsd: run.costUsd,
      estimatedCostUsd: run.estimatedCostUsd,
      error: run.error,
      createdAt: run.createdAt.getTime(),
      apifyRunId: run.apifyRunId,
      hasDataset: !!run.datasetId,
      scan: getAutoScan(run.id),
      postRun: getPostRun(run.id),
    } satisfies RunRow,
  }));

  // Runs still moving are pinned above the tabs, so they keep updating whichever tab is open.
  const live = allRuns.filter((r) => isLiveRun({ status: r.row.status, scanning: r.row.scan?.state === "scanning" }));
  const liveIds = new Set(live.map((r) => r.row.id));
  const history = allRuns.filter((r) => !liveIds.has(r.row.id));

  const placeCounts = getAreaPlaceCounts(niche.id);
  const areaStats = new Map(
    areas.map((a) => {
      const mine = allRuns.filter((r) => r.areaId === a.id);
      return [a.id, {
        runs: mine.length,
        spent: mine.reduce((sum, r) => sum + (r.row.costUsd ?? 0), 0),
        last: mine.reduce<Date | null>((best, r) => (!best || r.createdAt > best ? r.createdAt : best), null),
      }];
    }),
  );

  const tabs: { key: NicheTab; label: string; count?: number }[] = [
    { key: "overview", label: "Overview" },
    { key: "areas", label: "Areas", count: areas.length },
    { key: "runs", label: "Runs", count: allRuns.length },
  ];

  return (
    <FadeIn className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{niche.name}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{niche.target || "No target description yet."}</p>
        </div>
        <NicheActions id={niche.id} name={niche.name} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href={`${base}/places`} className={btn}><Table2 className="size-4" /> Prospects</Link>
        <Link href={`${base}/map`} className={btn}><MapIcon className="size-4" /> Map</Link>
        <Link href={`${base}/playbook`} className={btn}><Settings2 className="size-4" /> Playbook</Link>
        <Link href={`${base}/areas/new`} className={btn}><Plus className="size-4" /> Add area</Link>
      </div>

      {live.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">In progress</h2>
          <RunList runs={live.map((r) => r.row)} />
        </section>
      )}

      <nav className="flex gap-4 border-b sm:gap-6" aria-label="Niche sections">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={withParams(base, {}, { tab: t.key === "overview" ? null : t.key })}
            aria-current={view.tab === t.key ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-0.5 pb-2 text-sm font-medium transition-colors",
              view.tab === t.key ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {t.count != null && <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-xs tabular-nums">{t.count}</span>}
          </Link>
        ))}
      </nav>

      {view.tab === "overview" && (
        <div className="space-y-6">
          <NicheStatsCard nicheId={niche.id} stats={getNicheStats(niche.id)} />
          <ScanRefreshCard nicheId={niche.id} pending={findScansToRefresh(niche.id).length} state={getBackfill(niche.id)} />
          <NicheCostsCard costs={getNicheCosts(niche.id)} />
          <section className="space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-lg font-semibold">Latest runs</h2>
              {history.length > 5 && <Link href={withParams(base, {}, { tab: "runs" })} className="text-sm text-muted-foreground hover:underline">All {allRuns.length} runs →</Link>}
            </div>
            {finished(history.slice(0, 5).map((r) => r.row))}
          </section>
        </div>
      )}

      {view.tab === "areas" && areasTab()}
      {view.tab === "runs" && runsTab()}
    </FadeIn>
  );

  /** The runs table, or a note when everything so far is still in progress above. */
  function finished(rows: RunRow[]) {
    if (rows.length === 0 && live.length > 0) return <p className="text-sm text-muted-foreground">No finished runs yet.</p>;
    return <RunList runs={rows} />;
  }

  function areasTab() {
    const q = view.q?.toLowerCase();
    const matches = areas.filter((a) => !q || a.name.toLowerCase().includes(q));
    const page = paginate(matches, view.page);
    return (
      <section className="space-y-3">
        <NicheListFilters basePath={base} search />
        {areas.length === 0 ? (
          <p className="text-sm text-muted-foreground">No areas yet. Add one to draw a search shape on the map. All areas feed one combined pipeline.</p>
        ) : matches.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No areas match.</p>
        ) : (
          <ul className="divide-y rounded-lg border bg-card/50">
            {page.rows.map((a) => {
              const shape = areaShape(a);
              const stats = areaStats.get(a.id)!;
              const pts = gridPoints(shape, a.gridSpacingKm).length;
              return (
                <li key={a.id}>
                  <Link href={`${base}/areas/${a.id}`} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-3 hover:bg-muted/40">
                    <div className="flex min-w-0 items-center gap-3">
                      <MapPinned className="size-4 shrink-0 text-blue-600 dark:text-blue-400" />
                      <div className="min-w-0">
                        <div className="truncate font-medium">{a.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {shape.shape === "radius" ? `${shape.radiusKm.toFixed(1)} km radius` : `polygon, ~${Math.round(polygonAreaKm2(shape.polygon))} km²`}
                          {" · "}{pts} grid points @ {a.gridSpacingKm} km · {a.queries.length} {a.queries.length === 1 ? "query" : "queries"}
                        </div>
                      </div>
                    </div>
                    <div className="text-xs tabular-nums text-muted-foreground">
                      {placeCounts.get(a.id) ?? 0} businesses · {stats.runs} {stats.runs === 1 ? "run" : "runs"}
                      {stats.spent > 0 && ` · ${money(stats.spent)}`}
                      {stats.last ? ` · last ${day(stats.last)}` : " · not run yet"}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        <Pager base={base} sp={sp} page={page.page} pages={page.pages} total={page.total} noun={page.total === 1 ? "area" : "areas"} />
      </section>
    );
  }

  function runsTab() {
    const matches = history.filter((r) => (!view.areaId || r.areaId === view.areaId) && matchesRunStatus(r.row.status, view.status));
    const page = paginate(matches, view.page);
    return (
      <section className="space-y-3">
        <NicheListFilters basePath={base} areas={areas.map((a) => ({ id: a.id, name: a.name }))} status />
        {matches.length === 0 && history.length > 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No runs match.</p>
        ) : (
          finished(page.rows.map((r) => r.row))
        )}
        <Pager base={base} sp={sp} page={page.page} pages={page.pages} total={page.total} noun={page.total === 1 ? "run" : "runs"} />
      </section>
    );
  }
}
