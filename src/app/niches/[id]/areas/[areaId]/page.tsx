import Link from "next/link";
import { notFound } from "next/navigation";
import AreaEditor from "@/components/area-editor";
import { FadeIn } from "@/components/fade-in";
import { PLAN, RUN_COST_CAP_USD } from "@/lib/apify";
import { areaShape } from "@/lib/areas";
import { getArea, getAreas, getNiche } from "@/lib/queries";

export default async function AreaPage({ params }: { params: Promise<{ id: string; areaId: string }> }) {
  const { id, areaId } = await params;
  const niche = getNiche(Number(id));
  if (!niche) notFound();

  const isNew = areaId === "new";
  const area = isNew ? null : getArea(niche.id, Number(areaId));
  if (!isNew && !area) notFound();

  const others = getAreas(niche.id).filter((a) => a.id !== area?.id);
  // New areas start from the niche's seed queries; existing areas offer other areas' queries for reuse.
  const reusable = [...new Set([...others.flatMap((a) => a.queries), ...niche.playbook.seedQueries])];

  return (
    <FadeIn className="mx-auto max-w-7xl">
      <div className="mb-6">
        <Link href={`/niches/${niche.id}`} className="text-sm text-muted-foreground hover:underline">← {niche.name}</Link>
        <h1 className="text-2xl font-semibold">{area ? area.name : "New area"}</h1>
      </div>
      <AreaEditor
        nicheId={niche.id}
        plan={PLAN()}
        costCapUsd={RUN_COST_CAP_USD()}
        reusableQueries={reusable}
        defaultQueries={niche.playbook.seedQueries.slice(0, 3)}
        area={
          area
            ? {
                id: area.id,
                name: area.name,
                shape: areaShape(area),
                gridSpacingKm: area.gridSpacingKm,
                queries: area.queries,
                num: area.num,
                skipClosedPlaces: area.skipClosedPlaces,
                gl: area.gl,
                hl: area.hl,
              }
            : null
        }
      />
    </FadeIn>
  );
}
