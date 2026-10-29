import { ensureScored } from "@/lib/rescore";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowDown, ArrowUp, Ban } from "lucide-react";
import { AnimatedBar } from "@/components/animated-bar";
import { BulkEnrichButton } from "@/components/bulk-enrich-button";
import { ClassifyButton } from "@/components/classify-button";
import { FadeIn } from "@/components/fade-in";
import { FadeRow } from "@/components/fade-row";
import { PlaceThumb } from "@/components/place-thumb";
import { PlacesFilters } from "@/components/places-filters";
import { StageBadge } from "@/components/stage-badge";
import { ResultsNav } from "@/components/results-nav";
import { OfferChip, ScoreBadge } from "@/components/score-bits";
import { Badge } from "@/components/ui/badge";
import { TIER_STYLE } from "@/lib/offer-ui";
import { tierOf } from "@/lib/scoring";
import { getActiveRuns } from "@/lib/enrich-db";
import { getNiche, getNicheAreasLite, getRelevanceCounts, parseFilters, queryNichePlaces, type SortKey } from "@/lib/queries";
import { withParams } from "@/lib/url";

type SP = Promise<Record<string, string | string[] | undefined>>;

const REL_VARIANT = { target: "default", adjacent: "secondary", noise: "outline" } as const;

export default async function PlacesPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { id } = await params;
  const sp = await searchParams;
  const niche = getNiche(Number(id));
  if (!niche) notFound();
  ensureScored();

  const f = parseFilters(sp);
  const { rows, total, pages } = queryNichePlaces(niche.id, f);
  const counts = getRelevanceCounts(niche.id);
  const areas = getNicheAreasLite(niche.id);
  const multiArea = areas.length > 1; // one area would repeat the same value on every row
  const base = `/niches/${niche.id}/places`;
  const qs = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" && k !== "page" ? [[k, v]] : []))).toString();

  const sortLink = (key: SortKey, label: string, align = "text-left") => {
    const on = f.sort === key;
    const nextDir = on && f.dir === "desc" ? "asc" : "desc";
    return (
      <Link href={withParams(base, sp, { sort: key, dir: nextDir, page: null })} className={`inline-flex items-center gap-1 hover:text-foreground ${align} ${on ? "text-foreground" : ""}`}>
        {label}
        {on && (f.dir === "desc" ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
      </Link>
    );
  };

  return (
    <FadeIn className="mx-auto max-w-7xl space-y-4">
      <div>
        <Link href={`/niches/${niche.id}`} className="text-sm text-muted-foreground hover:underline">← {niche.name}</Link>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">Prospects</h1>
          <div className="flex items-center gap-2">
            <BulkEnrichButton nicheId={niche.id} running={getActiveRuns().length > 0} />
            <ClassifyButton nicheId={niche.id} gray={counts.gray} />
            <ResultsNav nicheId={niche.id} active="table" qs={qs} />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <Count label="Targets" n={counts.target} href={withParams(base, {}, { rel: "target" })} />
        <Count label="Adjacent" n={counts.adjacent} href={withParams(base, {}, { rel: "adjacent" })} />
        <Count label="Undecided" n={counts.gray} href={withParams(base, {}, { rel: "gray" })} />
        <Count label="Noise" n={counts.noise} href={withParams(base, {}, { rel: "noise" })} />
        <span className="text-muted-foreground">{counts.total} scraped</span>
      </div>

      <PlacesFilters basePath={base} areas={areas} />

      <div className="max-h-[calc(100vh-17rem)] min-h-64 overflow-auto rounded-lg border scrollbar-none">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground [&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-muted [&_th]:whitespace-nowrap [&_th]:shadow-[inset_0_-1px_0_var(--border)]">
            <tr>
              <th className="px-2.5 py-2">{sortLink("title", "Business")}</th>
              <th className="px-2.5 py-2">{sortLink("score", "Score")}</th>
              <th className="px-2.5 py-2">Lead offer</th>
              {multiArea && <th className="px-2.5 py-2">{sortLink("area", "Area")}</th>}
              <th className="px-2.5 py-2">Stage</th>
              <th className="px-2.5 py-2 text-right">
                <span className="inline-flex gap-1.5">{sortLink("rating", "Rating", "justify-end")}<span aria-hidden>·</span>{sortLink("reviews", "Reviews", "justify-end")}</span>
              </th>
              <th className="px-2.5 py-2">Contact</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={multiArea ? 7 : 6} className="px-2.5 py-10 text-center text-muted-foreground">Nothing matches these filters.</td></tr>
            )}
            {rows.map((r, i) => (
              <FadeRow key={r.placeId} index={i} className="border-t align-middle hover:bg-muted/30">
                <td className="max-w-[260px] px-2.5 py-2">
                  <Link href={`/niches/${niche.id}/places/${encodeURIComponent(r.placeId)}`} className="flex items-center gap-3">
                    <PlaceThumb title={r.title} imageUrl={r.imageUrl} thumbnailUrl={r.thumbnailUrl} logoUrl={r.logoUrl} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 font-medium">
                        {r.title}
                        {r.doNotContact && <Ban className="size-3.5 text-destructive" aria-label="Do not contact" />}
                        {r.relevance !== "target" && (
                          <Badge variant={r.relevance ? REL_VARIANT[r.relevance] : "outline"} title={r.relevanceReason ?? undefined} className="font-normal">
                            {r.relevance ?? "undecided"}
                          </Badge>
                        )}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {r.categories.slice(0, 2).join(", ")}{r.city ? ` · ${r.city}` : ""}
                        {r.photosCount != null && <span title="Photos on Google"> · {r.photosCount} photos</span>}
                      </div>
                    </div>
                  </Link>
                </td>
                <td className="px-2.5 py-2">
                  <ScoreBadge score={r.score} />
                  <div className="mt-1 h-1 w-16 rounded-full bg-muted">
                    <AnimatedBar pct={r.score ?? 0} delay={Math.min(i, 20) * 0.03} className={TIER_STYLE[tierOf(r.score)]} />
                  </div>
                </td>
                <td className="px-2.5 py-2">
                  <div className="flex flex-col items-start gap-1">
                    <OfferChip offer={r.leadOffer} />
                    {r.runnerUpOffer && <OfferChip offer={r.runnerUpOffer} muted className="text-[11px]" />}
                  </div>
                </td>
                {multiArea && <td className="whitespace-nowrap px-2.5 py-2">{r.areaName ?? "–"}</td>}
                <td className="px-2.5 py-2"><StageBadge stage={r.stage} /></td>
                <td className="whitespace-nowrap px-2.5 py-2 text-right tabular-nums">
                  {r.totalScore ?? "–"} <span className="text-muted-foreground">· {r.reviewsCount ?? "–"}</span>
                </td>
                <td className="px-2.5 py-2 text-xs">
                  <div className="whitespace-nowrap">{r.phone ?? <span className="text-muted-foreground">no phone</span>}</div>
                  <div className="max-w-40 truncate text-muted-foreground" title={r.domain ?? undefined}>{r.domain ?? "no website"}</div>
                  {r.ownerName && <div className="max-w-40 truncate font-medium" title="Owner (from enrichment)">{r.ownerName}</div>}
                </td>
              </FadeRow>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{total.toLocaleString()} match{total === 1 ? "" : "es"}</span>
        {pages > 1 && (
          <div className="flex items-center gap-3">
            {f.page > 1 && <Link className="hover:text-foreground" href={withParams(base, sp, { page: String(f.page - 1) })}>← Prev</Link>}
            <span>Page {Math.min(f.page, pages)} of {pages}</span>
            {f.page < pages && <Link className="hover:text-foreground" href={withParams(base, sp, { page: String(f.page + 1) })}>Next →</Link>}
          </div>
        )}
      </div>
    </FadeIn>
  );
}

function Count({ label, n, href }: { label: string; n: number; href: string }) {
  return (
    <Link href={href} className="hover:underline">
      <span className="font-semibold tabular-nums">{n}</span> <span className="text-muted-foreground">{label}</span>
    </Link>
  );
}
