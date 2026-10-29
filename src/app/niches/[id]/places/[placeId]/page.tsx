import { ensureScored } from "@/lib/rescore";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, Mail, MapPin, Phone, Star } from "lucide-react";
import { AnimatedBar } from "@/components/animated-bar";
import { CallLogPanel } from "@/components/call-log-panel";
import { QueueBar } from "@/components/queue-bar";
import { DetailTabs } from "@/components/detail-tabs";
import { EnrichButton } from "@/components/enrich-button";
import { EnrichmentCard } from "@/components/enrichment-card";
import { FacebookCard } from "@/components/facebook-card";
import { FadeIn } from "@/components/fade-in";
import { OwnerEditor } from "@/components/owner-editor";
import { PitchBrief } from "@/components/pitch-brief";
import { PlaceControls } from "@/components/place-controls";
import { RecentReviews } from "@/components/recent-reviews";
import { PlaceThumb } from "@/components/place-thumb";
import { OfferChip, ScoreBadge } from "@/components/score-bits";
import { CapacityTip, FitGateTip, GapsTip, ReachabilityTip } from "@/components/score-help";
import { StageSelect } from "@/components/stage-select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { parseTab } from "@/lib/detail-tab";
import { enrichableUrl } from "@/lib/enrich";
import { getEnrichment, placesInFlight } from "@/lib/enrich-db";
import { getFacebookSearch } from "@/lib/facebook-search-db";
import { getOwnerSearch } from "@/lib/owner-search-db";
import { getContactInfo, getSiteScan } from "@/lib/site-scan-db";
import { isStreetView } from "@/lib/images";
import { OFFER_LABEL, OFFERS, type OfferKey } from "@/lib/offers";
import { OFFER_STYLE } from "@/lib/offer-ui";
import { getQueue } from "@/lib/call-queue-db";
import { parseQueueParams } from "@/lib/call-queue";
import { getCallLog } from "@/lib/outreach-db";
import { buildBrief } from "@/lib/pitch";
import { getNiche, getPlaceDetail } from "@/lib/queries";
import { cn } from "@/lib/utils";

function decode(id: string) {
  try {
    return id.includes("%") ? decodeURIComponent(id) : id;
  } catch {
    return id;
  }
}

export default async function PlaceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; placeId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id, placeId: raw } = await params;
  const sp = await searchParams;
  const niche = getNiche(Number(id));
  if (!niche) notFound();
  ensureScored();
  const d = getPlaceDetail(niche.id, decode(raw));
  if (!d) notFound();
  const { place: p, np, areaName, contact, fb, found, otherNiches } = d;

  // Working the call queue: where this business sits in it, and how many others are waiting.
  const qp = parseQueueParams(sp);
  const queue = qp.on ? getQueue(niche.id, { adjacent: qp.adjacent }) : null;
  const inQueue = queue?.find((i) => i.placeId === p.placeId) ?? null;
  const waiting = queue ? queue.filter((i) => i.placeId !== p.placeId).length : 0;

  const offers = OFFERS.map((o) => ({ key: o, ...(np.offerScores?.[o] ?? { score: 0, evidence: [] as string[] }) })).sort((a, b) => b.score - a.score);
  const bd = np.scoreBreakdown;

  const log = getCallLog(p.placeId).map((e) => ({
    ...e,
    followUp: e.followUp?.getTime() ?? null,
    createdAt: e.createdAt.getTime(),
  }));
  const enrichment = getEnrichment(p.placeId);
  const ownerSearch = getOwnerSearch(p.placeId);
  const facebookSearch = getFacebookSearch(p.placeId);
  const scan = getSiteScan(p.placeId);
  const reach = getContactInfo(p.placeId);
  const lookingUp = placesInFlight().has(p.placeId);
  const ownerName = contact?.ownerName ?? null;
  const ownerIsGuess = (contact?.confidence ?? 1) < 0.8;
  const ownerTitle = enrichment?.profile.people.find((x) => x.name === ownerName)?.title ?? null;
  const dnc = contact?.doNotContact ? "Marked do-not-contact" : null;
  const siteBlocked = dnc ?? (enrichableUrl(p) ? null : "No business website to read (only a social page, or none)");
  const brief = np.leadOffer
    ? buildBrief({
        offer: np.leadOffer,
        runnerUp: np.runnerUpOffer,
        title: p.title,
        owner: ownerName,
        reviews: p.reviewsCount,
        rating: p.totalScore,
        evidence: np.offerScores?.[np.leadOffer]?.evidence ?? [],
      })
    : null;

  return (
    <>
    <FadeIn className="mx-auto max-w-5xl space-y-6">
      <Link href={`/niches/${niche.id}/places`} className="text-sm text-muted-foreground hover:underline">← Prospects</Link>

      <div className="flex flex-wrap items-start gap-5">
        <PlaceThumb title={p.title} imageUrl={p.imageUrl} thumbnailUrl={p.thumbnailUrl} logoUrl={p.logoUrl} size={96} />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold">{p.title}</h1>
            <ScoreBadge score={np.score} />
            <StageSelect nicheId={niche.id} placeId={p.placeId} stage={np.stage} />
            {contact?.doNotContact && <Badge variant="destructive">Do not contact</Badge>}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {p.categories.map((c) => <Badge key={c} variant="secondary">{c}</Badge>)}
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted-foreground">
            {p.address && <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" /> {p.address}</span>}
            {p.totalScore != null && <span className="inline-flex items-center gap-1"><Star className="size-3.5" /> {p.totalScore} ({p.reviewsCount ?? 0} reviews)</span>}
            {p.photosCount != null && <span>{p.photosCount} photos</span>}
            {areaName && <span>Area: {areaName}</span>}
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            {p.phone && <a className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 hover:bg-muted" href={`tel:${p.phone}`}><Phone className="size-3.5" /> {p.phone}</a>}
            {p.website && <a className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 hover:bg-muted" href={p.website} target="_blank" rel="noopener noreferrer"><ExternalLink className="size-3.5" /> {p.domain ?? "Website"}</a>}
            <a className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 hover:bg-muted" href={`https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(p.placeId)}`} target="_blank" rel="noopener noreferrer"><ExternalLink className="size-3.5" /> Google Maps</a>
            <EnrichButton placeId={p.placeId} blockedReason={dnc} done={ownerSearch != null || enrichment != null} running={lookingUp} />
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <OwnerEditor placeId={p.placeId} ownerName={ownerName} typedByYou={contact?.source === "manual"} isGuess={ownerIsGuess} role={ownerTitle} />
            {reach.emails.slice(0, 2).map((e) => (
              <a key={e} className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 hover:bg-muted" href={`mailto:${e}`}><Mail className="size-3.5" /> {e}</a>
            ))}
          </div>
          {isStreetView(p.imageUrl) && <p className="text-xs text-muted-foreground">Only a Street View image on Google, so no owner photos: a gap worth noting on a call.</p>}
        </div>
      </div>

      <DetailTabs
        initial={parseTab(sp.tab)}
        callCount={log.length}
        outreach={
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <CallLogPanel nicheId={niche.id} placeId={p.placeId} defaultOffer={np.leadOffer} entries={log} queue={qp.on ? { adjacent: qp.adjacent } : null} />
            <PitchBrief brief={brief} title={p.title} />
          </div>
        }
        score={
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Why this score</CardTitle>
                <CardDescription>Fit gate × (capacity + gaps + reachability)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                {bd ? (
                  <>
                    <div className="max-w-xs"><Part label="Fit gate" value={`×${bd.fit}`} tip={<FitGateTip />} /></div>
                    <div className="grid gap-x-8 gap-y-3 sm:grid-cols-3">
                      <Bar label="Capacity" value={bd.capacity} max={40} tip={<CapacityTip />} delay={0} />
                      <Bar label="Gaps" value={bd.gaps} max={35} tip={<GapsTip />} delay={0.1} />
                      <Bar label="Reachability" value={bd.reachability} max={25} tip={<ReachabilityTip />} delay={0.2} />
                    </div>
                    {bd.notes.map((n) => <p key={n} className="text-xs text-amber-700 dark:text-amber-400">{n}</p>)}
                  </>
                ) : (
                  <p className="text-muted-foreground">Not scored yet.</p>
                )}
              </CardContent>
            </Card>

            <section className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-lg font-semibold">Offer fit</h2>
                <span className="text-sm text-muted-foreground">Lead with</span>
                <OfferChip offer={np.leadOffer} />
                {np.runnerUpOffer && (<><span className="text-sm text-muted-foreground">then</span><OfferChip offer={np.runnerUpOffer} muted /></>)}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {offers.map((o) => <OfferCard key={o.key} offer={o.key} score={o.score} evidence={o.evidence} lead={np.leadOffer === o.key} />)}
              </div>
            </section>
          </div>
        }
        details={
          <div className="space-y-4">
            <EnrichmentCard
              site={enrichment}
              search={ownerSearch}
              scan={scan}
              contact={reach}
              ownerName={ownerName}
              ownerIsGuess={ownerIsGuess}
              actions={
                <>
                  <EnrichButton placeId={p.placeId} method="scan" fallback={false} blockedReason={siteBlocked} done={scan != null} running={false} />
                  <EnrichButton placeId={p.placeId} method="site" blockedReason={siteBlocked} done={enrichment != null} running={lookingUp} />
                </>
              }
            />
            <div className="grid items-start gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Your call</CardTitle>
                  <CardDescription>Overrides apply to this niche only, except do-not-contact.</CardDescription>
                </CardHeader>
                <CardContent>
                  <PlaceControls
                    nicheId={niche.id}
                    placeId={p.placeId}
                    relevance={np.relevance}
                    source={np.relevanceSource}
                    reason={np.relevanceReason}
                    doNotContact={contact?.doNotContact ?? false}
                  />
                </CardContent>
              </Card>

              <FacebookCard
                fb={fb ?? null}
                search={facebookSearch}
                country={(p.countryCode ?? "US").toUpperCase()}
                action={<EnrichButton placeId={p.placeId} method="facebook" blockedReason={dnc ?? (fb?.pageUrl ? "Already has a Facebook page" : null)} done={facebookSearch != null} running={lookingUp} />}
              />
            </div>

            <RecentReviews
              sample={p.reviewSample}
              sampledAt={p.reviewsSampledAt}
              action={<EnrichButton placeId={p.placeId} method="reviews" blockedReason={dnc} done={p.reviewSample != null} running={lookingUp} />}
            />

            <div className="grid items-start gap-4 md:grid-cols-2">
              <Card>
                <CardHeader><CardTitle>Hours</CardTitle></CardHeader>
                <CardContent className="text-sm">
                  {p.openingHours && Object.keys(p.openingHours).length ? (
                    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5">
                      {Object.entries(p.openingHours).map(([day, h]) => (<div key={day} className="contents"><dt className="text-muted-foreground">{day}</dt><dd>{h}</dd></div>))}
                    </dl>
                  ) : <p className="text-muted-foreground">No hours listed on Google.</p>}
                  <p className="mt-2 text-xs text-muted-foreground">{p.bookingLinks?.length ? `${p.bookingLinks.length} booking link(s) on the listing.` : "No booking link on the listing."}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Where it came from</CardTitle>
                  <CardDescription>Which queries and grid points surfaced it.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <ul className="space-y-0.5">
                    {found.map((f, i) => (
                      <li key={i}>Run #{f.runId} · {f.areaName} · “{f.query || "?"}”{f.gridIndex != null && <span className="text-muted-foreground"> · grid point {f.gridIndex}</span>}</li>
                    ))}
                    {found.length === 0 && <li className="text-muted-foreground">No run provenance recorded.</li>}
                  </ul>
                  {otherNiches.length > 0 && (
                    <p className="text-muted-foreground">
                      Also tracked in{" "}
                      {otherNiches.map((n, i) => (<span key={n.id}>{i > 0 && ", "}<Link className="text-blue-600 hover:underline dark:text-blue-400" href={`/niches/${n.id}`}>{n.name}</Link></span>))}
                      . Contact history and the do-not-contact flag are shared, so notes never split across niches.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        }
      />
      {qp.on && <div className="h-16" aria-hidden />}
    </FadeIn>
    {/* Outside FadeIn: its animated transform would stop this fixed bar from sticking to the screen. */}
    {qp.on && <QueueBar nicheId={niche.id} placeId={p.placeId} title={p.title} phone={p.phone} kind={inQueue?.kind ?? null} left={waiting} adjacent={qp.adjacent} />}
    </>
  );
}

function Part({ label, value, tip }: { label: string; value: string; tip: React.ReactNode }) {
  return (
    <div className="flex justify-between">
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">{label}{tip}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

function Bar({ label, value, max, tip, delay }: { label: string; value: number; max: number; tip: React.ReactNode; delay: number }) {
  return (
    <div>
      <div className="flex justify-between">
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">{label}{tip}</span>
        <span className="font-medium tabular-nums">{value} / {max}</span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-muted"><AnimatedBar pct={(value / max) * 100} delay={delay} /></div>
    </div>
  );
}

function OfferCard({ offer, score, evidence, lead }: { offer: OfferKey; score: number; evidence: string[]; lead: boolean }) {
  return (
    <Card className={cn(lead && "ring-2 ring-blue-500/40")}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span>{OFFER_LABEL[offer]}</span>
          <span className="tabular-nums">{score}</span>
        </CardTitle>
        <div className="h-1.5 rounded-full bg-muted"><AnimatedBar pct={score} className={OFFER_STYLE[offer].bar} /></div>
      </CardHeader>
      <CardContent>
        {evidence.length === 0 ? <p className="text-sm text-muted-foreground">No supporting evidence.</p> : (
          <ul className="space-y-1 text-sm">
            {evidence.map((e, i) => (
              <li key={i} className={cn(e.startsWith("(inferred)") && "italic text-amber-700 dark:text-amber-400", e.startsWith("Pending:") && "text-muted-foreground")}>{e}</li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
