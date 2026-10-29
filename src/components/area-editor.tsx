"use client";

import dynamic from "next/dynamic";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, MapPin, Play, Save, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { deleteArea, saveArea } from "@/app/actions";
import {
  estimateCostUsd,
  estimateResults,
  estimateSeconds,
  gridPoints,
  polygonAreaKm2,
  RATE_PER_1000,
  type ApifyPlan,
  type Shape,
} from "@/lib/geo";
import { MAX_SEARCH_PER_CLICK, SEARCH_PAGE_USD, SEARCH_PER_BUSINESS_USD } from "@/lib/owner-search";
import { DEFAULT_MAX_REVIEWS, MAX_REVIEWS_LIMIT, REVIEW_RATE_PER_1000, reviewCostUsd } from "@/lib/reviews";
import { lines } from "@/lib/text";

const AreaMap = dynamic(() => import("./area-map"), {
  ssr: false,
  loading: () => <div className="h-[520px] w-full animate-pulse rounded-lg border bg-muted" />,
});

export type AreaEditorProps = {
  nicheId: number;
  area: {
    id: number;
    name: string;
    shape: Shape | null;
    gridSpacingKm: number;
    queries: string[];
    num: number;
    skipClosedPlaces: boolean;
    gl: string;
    hl: string;
    reviews: boolean;
    maxReviews: number;
    searchOwners: boolean;
    searchFacebook: boolean;
  } | null;
  /** Queries already used in this niche's other areas, offered for reuse. */
  reusableQueries: string[];
  /** Pre-filled queries for a brand-new area. */
  defaultQueries: string[];
  plan: ApifyPlan;
  costCapUsd: number;
};

const fmtTime = (s: number) => (s >= 90 ? `~${Math.round(s / 60)} min` : `~${s} s`);
const money = (n: number) => `$${n < 0.01 ? n.toFixed(4) : n.toFixed(2)}`;

export default function AreaEditor({ nicheId, area, reusableQueries, defaultQueries, plan, costCapUsd }: AreaEditorProps) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState(area?.name ?? "");
  const [shape, setShape] = useState<Shape | null>(area?.shape ?? null);
  const [spacing, setSpacing] = useState(area?.gridSpacingKm ?? 8);
  const [queryText, setQueryText] = useState((area?.queries ?? defaultQueries).join("\n"));
  const [num, setNum] = useState(area?.num ?? 500);
  const [skipClosed, setSkipClosed] = useState(area?.skipClosedPlaces ?? true);
  const [gl, setGl] = useState(area?.gl ?? "us");
  const [hl, setHl] = useState(area?.hl ?? "en");
  const [reviews, setReviews] = useState(area?.reviews ?? false);
  const [maxReviews, setMaxReviews] = useState(area?.maxReviews ?? DEFAULT_MAX_REVIEWS);
  const [searchOwners, setSearchOwners] = useState(area?.searchOwners ?? false);
  const [searchFacebook, setSearchFacebook] = useState(area?.searchFacebook ?? false);
  const [search, setSearch] = useState("");
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number; zoom?: number } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [launching, setLaunching] = useState(false);

  const queries = useMemo(() => lines(queryText), [queryText]);
  const points = useMemo(() => (shape ? gridPoints(shape, spacing) : []), [shape, spacing]);
  const est = useMemo(() => estimateResults({ points: points.length, queries: queries.length, num }), [points.length, queries.length, num]);
  const reviewsPerPlace = reviews ? maxReviews : 0;
  const likelyCost = estimateCostUsd(est.likely, plan, reviewsPerPlace);
  const maxCost = estimateCostUsd(est.max, plan, reviewsPerPlace);
  const likelyReviewCost = reviewCostUsd(est.likely, reviewsPerPlace);
  // The after-run searches cover the first MAX_SEARCH_PER_CLICK businesses that still need them.
  const searchCovers = Math.min(est.likely, MAX_SEARCH_PER_CLICK);
  const ownerSearchCost = searchOwners ? searchCovers * SEARCH_PER_BUSINESS_USD : 0;
  const facebookSearchCost = searchFacebook ? searchCovers * SEARCH_PAGE_USD : 0;

  const canSave = !!shape && queries.length > 0 && name.trim().length > 0;

  function payload() {
    if (!shape) throw new Error("Draw or enter an area first");
    return {
      name,
      shape: shape.shape,
      centerLat: shape.shape === "radius" ? shape.centerLat : null,
      centerLng: shape.shape === "radius" ? shape.centerLng : null,
      radiusKm: shape.shape === "radius" ? shape.radiusKm : null,
      polygon: shape.shape === "polygon" ? shape.polygon : null,
      gridSpacingKm: spacing,
      queries,
      num,
      skipClosedPlaces: skipClosed,
      gl,
      hl,
      reviews,
      maxReviews,
      searchOwners,
      searchFacebook,
    };
  }

  async function persist(): Promise<number | null> {
    try {
      const { id } = await saveArea(nicheId, area?.id ?? null, payload());
      return id;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save area");
      return null;
    }
  }

  function onSave() {
    start(async () => {
      const id = await persist();
      if (id == null) return;
      toast.success("Area saved");
      if (!area) router.replace(`/niches/${nicheId}/areas/${id}`);
      else router.refresh();
    });
  }

  async function onLaunch() {
    setLaunching(true);
    try {
      const id = await persist();
      if (id == null) return;
      const res = await fetch(`/api/areas/${id}/launch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ num, skipClosedPlaces: skipClosed, gl, hl, reviews, maxReviews, searchOwners, searchFacebook }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Launch failed");
      toast.success("Run started on Apify", { description: `${data.estimate.points} grid points` });
      setConfirmOpen(false);
      router.push(`/niches/${nicheId}`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Launch failed");
    } finally {
      setLaunching(false);
    }
  }

  async function geocode(e: React.FormEvent) {
    e.preventDefault();
    if (!search.trim()) return;
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(search)}`);
      const [hit] = await r.json();
      if (!hit) return toast.info("No match for that place");
      setFlyTo({ lat: Number(hit.lat), lng: Number(hit.lon), zoom: 10 });
    } catch {
      toast.error("Place search failed");
    }
  }

  function onDelete() {
    if (!area || !confirm(`Delete area "${area.name}" and its runs?`)) return;
    start(async () => {
      await deleteArea(nicheId, area.id);
      toast.success("Area deleted");
      router.push(`/niches/${nicheId}`);
    });
  }

  const radius = shape?.shape === "radius" ? shape : null;
  const setRadius = (patch: Partial<NonNullable<typeof radius>>) =>
    radius && setShape({ ...radius, ...patch });

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-3">
        <form onSubmit={geocode} className="flex gap-2">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Jump to a place, e.g. Houston, TX" />
          <Button type="submit" variant="outline"><Search /> Go</Button>
        </form>
        <AreaMap shape={shape} points={points} onShape={setShape} flyTo={flyTo} />
        <p className="text-xs text-muted-foreground">
          Use the toolbar (top left) to draw a polygon or a radius circle. One shape per area. Red dot = centre point
          (searched first), blue dots = grid points. The grid is an estimate of what the actor will search.
        </p>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Area</CardTitle>
            <CardDescription>A big metro can be several areas; all feed one pipeline.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="area-name">Name</Label>
              <Input id="area-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="North Houston" />
            </div>
            {radius && (
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1.5">
                  <Label>Lat</Label>
                  <Input type="number" step="any" value={Number(radius.centerLat.toFixed(5))} onChange={(e) => setRadius({ centerLat: Number(e.target.value) })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Lng</Label>
                  <Input type="number" step="any" value={Number(radius.centerLng.toFixed(5))} onChange={(e) => setRadius({ centerLng: Number(e.target.value) })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Radius km</Label>
                  <Input type="number" step="any" min={0.1} value={Number(radius.radiusKm.toFixed(2))} onChange={(e) => setRadius({ radiusKm: Number(e.target.value) })} />
                </div>
              </div>
            )}
            {shape?.shape === "polygon" && (
              <p className="text-sm text-muted-foreground">
                Polygon with {shape.polygon.length} points, ~{Math.round(polygonAreaKm2(shape.polygon)).toLocaleString()} km².
              </p>
            )}
            {!shape && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="size-4" /> No shape yet. Draw one on the map.
              </p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="spacing">Grid spacing (km)</Label>
              <Input id="spacing" type="number" step="0.5" min={0.5} max={50} value={spacing} onChange={(e) => setSpacing(Number(e.target.value) || 8)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Run setup</CardTitle>
            <CardDescription>One search per line.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea rows={5} value={queryText} onChange={(e) => setQueryText(e.target.value)} placeholder={"epoxy flooring\ngarage floor coating"} />
            {reusableQueries.filter((q) => !queries.some((x) => x.toLowerCase() === q.toLowerCase())).length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Reuse from other areas:</span>
                {reusableQueries
                  .filter((q) => !queries.some((x) => x.toLowerCase() === q.toLowerCase()))
                  .map((q) => (
                    <button key={q} type="button" onClick={() => setQueryText((t) => (t.trim() ? `${t.trim()}\n${q}` : q))} className="rounded-full border px-2 py-0.5 text-xs hover:bg-muted">
                      + {q}
                    </button>
                  ))}
              </div>
            )}
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1.5">
                <Label>Results / query</Label>
                <Input type="number" min={10} max={500} value={num} onChange={(e) => setNum(Math.min(500, Math.max(10, Number(e.target.value) || 500)))} />
              </div>
              <div className="space-y-1.5">
                <Label>Country (gl)</Label>
                <Input value={gl} maxLength={2} onChange={(e) => setGl(e.target.value.toLowerCase())} />
              </div>
              <div className="space-y-1.5">
                <Label>Language (hl)</Label>
                <Input value={hl} maxLength={5} onChange={(e) => setHl(e.target.value.toLowerCase())} />
              </div>
            </div>
            <label className="flex items-center justify-between text-sm">
              Skip closed places
              <Switch checked={skipClosed} onCheckedChange={setSkipClosed} />
            </label>
            <div className="space-y-2 rounded-lg border p-3">
              <label className="flex items-center justify-between text-sm font-medium">
                Include the newest reviews
                <Switch checked={reviews} onCheckedChange={setReviews} />
              </label>
              <p className="text-xs text-muted-foreground">
                Shows how recently each business has been getting reviews, and whether the owner replies. A long gap points to the review system; a
                big review base that has gone quiet points to reactivation. Adds ${REVIEW_RATE_PER_1000.toFixed(2)} per 1,000 reviews returned. Places already in
                your database get their review data filled in and are rescored.
              </p>
              {reviews && (
                <div className="flex items-center gap-2 text-sm">
                  <Label className="whitespace-nowrap">Reviews per place</Label>
                  <Input
                    type="number"
                    min={1}
                    max={MAX_REVIEWS_LIMIT}
                    className="w-20"
                    value={maxReviews}
                    onChange={(e) => setMaxReviews(Math.min(MAX_REVIEWS_LIMIT, Math.max(1, Math.round(Number(e.target.value)) || DEFAULT_MAX_REVIEWS)))}
                  />
                  <span className="text-xs text-muted-foreground">newest first; 5 is enough to date the last review</span>
                </div>
              )}
            </div>
            <div className="space-y-2 rounded-lg border p-3">
              <div className="text-sm font-medium">After the run: paid searches</div>
              <p className="text-xs text-muted-foreground">
                Off by default, since each costs money. They start on their own once the run&apos;s businesses are in, for the first {MAX_SEARCH_PER_CLICK} that don&apos;t
                have the answer yet. The free website scan always runs, and the paid website reader is never automatic.
              </p>
              <label className="flex items-start justify-between gap-3 text-sm">
                <span>
                  Search the web for owner names
                  <span className="block text-xs text-muted-foreground">About ${SEARCH_PER_BUSINESS_USD.toFixed(4)} each: a Google search, then your model reads the results.</span>
                </span>
                <Switch checked={searchOwners} onCheckedChange={setSearchOwners} />
              </label>
              <label className="flex items-start justify-between gap-3 text-sm">
                <span>
                  Find Facebook pages
                  <span className="block text-xs text-muted-foreground">About ${SEARCH_PAGE_USD.toFixed(4)} each: a Google search for the name, city and state plus “Facebook”.</span>
                </span>
                <Switch checked={searchFacebook} onCheckedChange={setSearchFacebook} />
              </label>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Estimate</CardTitle>
            <CardDescription>Planning numbers, not promises.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">Grid points</dt>
              <dd className="text-right font-medium">{points.length}</dd>
              <dt className="text-muted-foreground">Run time</dt>
              <dd className="text-right font-medium">{points.length ? fmtTime(estimateSeconds(points.length)) : "–"}</dd>
              <dt className="text-muted-foreground">Results (likely / max)</dt>
              <dd className="text-right font-medium">{points.length ? `${est.likely.toLocaleString()} / ${est.max.toLocaleString()}` : "–"}</dd>
              <dt className="text-muted-foreground">Cost (likely / max)</dt>
              <dd className="text-right font-medium">{points.length ? `${money(likelyCost)} / ${money(maxCost)}` : "–"}</dd>
              {reviews && (
                <>
                  <dt className="text-muted-foreground">of which reviews (up to)</dt>
                  <dd className="text-right font-medium">{points.length ? money(likelyReviewCost) : "–"}</dd>
                </>
              )}
              {(searchOwners || searchFacebook) && (
                <>
                  <dt className="text-muted-foreground">After-run searches (up to)</dt>
                  <dd className="text-right font-medium">{points.length ? money(ownerSearchCost + facebookSearchCost) : "–"}</dd>
                </>
              )}
            </dl>
            <p className="mt-2 text-xs text-muted-foreground">
              {plan} plan: ${RATE_PER_1000[plan].toFixed(2)} per 1,000 results. Max assumes every query returns {num} results.
            </p>
            {points.length > 400 && (
              <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">That is a lot of grid points. Consider wider spacing or splitting into areas.</p>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-2">
          <Button onClick={onSave} disabled={!canSave || pending} variant="outline">
            {pending ? <Loader2 className="animate-spin" /> : <Save />} Save
          </Button>
          <Button onClick={() => setConfirmOpen(true)} disabled={!canSave || pending}>
            <Play /> Review &amp; launch
          </Button>
          {area && (
            <Button onClick={onDelete} variant="destructive" disabled={pending} className="ml-auto">
              <Trash2 /> Delete
            </Button>
          )}
        </div>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Launch this run?</DialogTitle>
            <DialogDescription>
              This spends real Apify credit. Saves the area first, then starts the actor.
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-1 text-sm">
            <li>{queries.length} {queries.length === 1 ? "query" : "queries"} × {points.length} grid points, up to {num} results per query</li>
            <li>Time {fmtTime(estimateSeconds(points.length))}</li>
            {reviews && (
              <li>Includes the newest {maxReviews} reviews of each place (up to {money(likelyReviewCost)} of the likely cost)</li>
            )}
            <li>Likely cost {money(likelyCost)}, worst case {money(maxCost)}</li>
            {searchOwners && <li>Then searches the web for owner names, up to {money(ownerSearchCost)} more</li>}
            {searchFacebook && <li>Then looks for Facebook pages, up to {money(facebookSearchCost)} more</li>}
            <li className="text-muted-foreground">Hard cap sent to Apify: {money(costCapUsd)}. Change with RUN_COST_CAP_USD.</li>
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={launching}>Cancel</Button>
            <Button onClick={onLaunch} disabled={launching}>
              {launching ? <Loader2 className="animate-spin" /> : <Play />} Start run
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
