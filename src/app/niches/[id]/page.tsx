import Link from "next/link";
import { notFound } from "next/navigation";
import { Map as MapIcon, MapPinned, Plus, Settings2, Table2 } from "lucide-react";
import { FadeIn } from "@/components/fade-in";
import { NicheActions } from "@/components/niche-actions";
import { RunList } from "@/components/run-list";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAreas, getNiche, getRuns } from "@/lib/queries";
import { getPostRun } from "@/lib/post-run";
import { getAutoScan } from "@/lib/site-scan-db";
import { areaShape } from "@/lib/areas";
import { gridPoints, polygonAreaKm2 } from "@/lib/geo";

const btn = "inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted";

export default async function NichePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const niche = getNiche(Number(id));
  if (!niche) notFound();
  const areas = getAreas(niche.id);
  const runs = getRuns(niche.id);

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
        <Link href={`/niches/${niche.id}/places`} className={btn}><Table2 className="size-4" /> Prospects</Link>
        <Link href={`/niches/${niche.id}/map`} className={btn}><MapIcon className="size-4" /> Map</Link>
        <Link href={`/niches/${niche.id}/playbook`} className={btn}><Settings2 className="size-4" /> Playbook</Link>
        <Link href={`/niches/${niche.id}/areas/new`} className={btn}><Plus className="size-4" /> Add area</Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Areas</CardTitle>
          <CardDescription>All areas feed one combined pipeline.</CardDescription>
        </CardHeader>
        <CardContent>
          {areas.length === 0 ? (
            <p className="text-sm text-muted-foreground">No areas yet. Add one to draw a search shape on the map.</p>
          ) : (
            <ul className="divide-y">
              {areas.map((a) => {
                const shape = areaShape(a);
                const pts = gridPoints(shape, a.gridSpacingKm).length;
                return (
                  <li key={a.id}>
                    <Link href={`/niches/${niche.id}/areas/${a.id}`} className="flex items-center justify-between gap-4 py-3 hover:bg-muted/40">
                      <div className="flex items-center gap-3">
                        <MapPinned className="size-4 text-blue-600 dark:text-blue-400" />
                        <div>
                          <div className="font-medium">{a.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {shape.shape === "radius" ? `${shape.radiusKm.toFixed(1)} km radius` : `polygon, ~${Math.round(polygonAreaKm2(shape.polygon))} km²`}
                            {" · "}{pts} grid points @ {a.gridSpacingKm} km · {a.queries.length} queries
                          </div>
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Runs</h2>
        <RunList
          runs={runs.map(({ run, areaName }) => ({
            id: run.id,
            areaName,
            status: run.status,
            resultCount: run.resultCount,
            newPlaceCount: run.newPlaceCount,
            costUsd: run.costUsd,
            estimatedCostUsd: run.estimatedCostUsd,
            error: run.error,
            createdAt: run.createdAt.getTime(),
            scan: getAutoScan(run.id),
            postRun: getPostRun(run.id),
          }))}
        />
      </section>
    </FadeIn>
  );
}
