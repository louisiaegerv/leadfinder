import { ensureScored } from "@/lib/rescore";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ClassifyButton } from "@/components/classify-button";
import { FadeIn } from "@/components/fade-in";
import { PlacesFilters } from "@/components/places-filters";
import { ResultsMap } from "@/components/results-map-loader";
import { ResultsNav } from "@/components/results-nav";
import { areaShape } from "@/lib/areas";
import { TIER_HEX } from "@/lib/offer-ui";
import { getAreas, getMapPoints, getNiche, getRelevanceCounts, parseFilters } from "@/lib/queries";

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function MapPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { id } = await params;
  const sp = await searchParams;
  const niche = getNiche(Number(id));
  if (!niche) notFound();
  ensureScored();

  const f = parseFilters(sp);
  const areas = getAreas(niche.id);
  const points = getMapPoints(niche.id, f).flatMap((p) =>
    p.lat != null && p.lng != null ? [{ placeId: p.placeId, title: p.title, lat: p.lat, lng: p.lng, score: p.score, leadOffer: p.leadOffer }] : [],
  );
  const counts = getRelevanceCounts(niche.id);
  const qs = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" && k !== "page" ? [[k, v]] : []))).toString();

  return (
    <FadeIn className="mx-auto max-w-7xl space-y-4">
      <div>
        <Link href={`/niches/${niche.id}`} className="text-sm text-muted-foreground hover:underline">← {niche.name}</Link>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">Prospect map</h1>
          <div className="flex items-center gap-2">
            <ClassifyButton nicheId={niche.id} gray={counts.gray} />
            <ResultsNav nicheId={niche.id} active="map" qs={qs} />
          </div>
        </div>
      </div>

      <PlacesFilters basePath={`/niches/${niche.id}/map`} areas={areas.map((a) => ({ id: a.id, name: a.name }))} />

      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span>{points.length} plotted</span>
        {(["A", "B", "C", "D"] as const).map((t) => (
          <span key={t} className="inline-flex items-center gap-1.5">
            <span className="inline-block size-3 rounded-full" style={{ background: TIER_HEX[t] }} /> Tier {t}
          </span>
        ))}
      </div>

      <ResultsMap nicheId={niche.id} points={points} areas={areas.map((a) => ({ name: a.name, shape: areaShape(a) }))} />
    </FadeIn>
  );
}
