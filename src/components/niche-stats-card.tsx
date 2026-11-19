import Link from "next/link";
import { Ban, CircleHelp, Database, GlobeOff, Layers, Target, ThumbsUp, Unlink, UserRound, type LucideIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { NicheStats } from "@/lib/niche-stats";
import { withParams } from "@/lib/url";

const pct = (n: number, of: number) => (of > 0 ? `${Math.round((n / of) * 100)}% of ${of}` : undefined);

/** Chip colours per tone, tinted so they read in both themes. */
const TONE = {
  green: "bg-green-500/10 text-green-600 dark:text-green-400",
  sky: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  slate: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
  violet: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  orange: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  red: "bg-red-500/10 text-red-600 dark:text-red-400",
  blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  teal: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
} as const;

function Stat({ label, value, sub, href, icon: Icon, tone }: { label: string; value: number; sub?: string; href?: string; icon: LucideIcon; tone: keyof typeof TONE }) {
  const body = (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-0.5 text-xl font-semibold tabular-nums">{value.toLocaleString("en-US")}</div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </div>
      <span className={`flex size-8 shrink-0 items-center justify-center rounded-md ${TONE[tone]}`}><Icon className="size-4" /></span>
    </div>
  );
  const cls = "rounded-lg border bg-card/50 p-3";
  return href ? <Link href={href} className={`${cls} transition-colors hover:bg-muted/60`}>{body}</Link> : <div className={cls}>{body}</div>;
}

export function NicheStatsCard({ nicheId, stats }: { nicheId: number; stats: NicheStats }) {
  const { relevance: c, prospects } = stats;
  const places = `/niches/${nicheId}/places`;
  const rel = (rel: string) => withParams(places, {}, { rel });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Results</CardTitle>
        <CardDescription>How the {c.total.toLocaleString("en-US")} scraped businesses sort out, and what we know about the {prospects.toLocaleString("en-US")} still in play.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Stat icon={Target} tone="green" label="Targets" value={c.target} href={rel("target")} />
          <Stat icon={Layers} tone="sky" label="Adjacent" value={c.adjacent} href={rel("adjacent")} />
          <Stat icon={CircleHelp} tone="amber" label="Undecided" value={c.gray} href={rel("gray")} />
          <Stat icon={Ban} tone="slate" label="Noise" value={c.noise} href={rel("noise")} />
          <Stat icon={Database} tone="violet" label="Total scraped" value={c.total} href={rel("all")} />
        </div>

        <div>
          <h3 className="mb-2 text-sm font-medium">Coverage of the businesses not ruled out</h3>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat
              icon={GlobeOff}
              tone="orange"
              label="No website"
              value={stats.noWebsite}
              sub={[pct(stats.noWebsite, prospects), stats.socialOnly > 0 ? `${stats.socialOnly} more use only a social page` : null].filter(Boolean).join(" · ") || undefined}
            />
            <Stat
              icon={Unlink}
              tone="red"
              label="Broken website"
              value={stats.brokenWebsite}
              sub={stats.scanned > 0 ? `of ${stats.scanned} scanned, did not load` : "no websites scanned yet"}
            />
            <Stat icon={ThumbsUp} tone="blue" label="With Facebook page" value={stats.withFacebook} sub={pct(stats.withFacebook, prospects)} />
            <Stat icon={UserRound} tone="teal" label="With owner name" value={stats.withOwner} sub={pct(stats.withOwner, prospects)} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            A website only counts as broken once it has been scanned, so this number grows as you enrich. Targets, adjacent and undecided businesses are included; noise is not.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
