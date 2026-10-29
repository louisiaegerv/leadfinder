import Link from "next/link";
import { CalendarClock, Check, Phone, Play } from "lucide-react";
import { DailyGoal } from "@/components/daily-goal";
import { buttonVariants } from "@/components/ui/button";
import { queueUrl } from "@/lib/call-queue";
import { dialsToday, getDailyGoal, nextLead, queueCounts } from "@/lib/call-queue-db";
import { listNiches } from "@/lib/queries";
import { FadeIn } from "@/components/fade-in";
import { FollowUpDone } from "@/components/follow-up-done";
import { PlaceThumb } from "@/components/place-thumb";
import { OfferChip } from "@/components/score-bits";
import { StageBadge } from "@/components/stage-badge";
import { OFFER_LABEL } from "@/lib/offers";
import { OUTCOME_INFO, dueBucket, startOfDay, type DueBucket, type Outcome } from "@/lib/outreach";
import { getFollowUps, getObjectionTally, getRecentActivity } from "@/lib/outreach-db";
import { cn } from "@/lib/utils";

const DAY = 86_400_000;
const outcomeLabel = (o: string) => OUTCOME_INFO[o as Outcome]?.label ?? o;
const link = (nicheId: number | null, placeId: string) => (nicheId ? `/niches/${nicheId}/places/${encodeURIComponent(placeId)}` : null);

function dueLabel(followUp: Date, now: Date): string {
  const days = Math.round((startOfDay(followUp).getTime() - startOfDay(now).getTime()) / DAY);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "1 day overdue";
  if (days < 0) return `${-days} days overdue`;
  return followUp.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export default async function OutreachPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const now = new Date();
  const adjacent = one(sp.adj) === "1";
  const counts = listNiches().map((n) => ({ niche: n, ...queueCounts(n.id, { adjacent }) }));
  const picked = counts.find((c) => String(c.niche.id) === one(sp.niche)) ?? counts.find((c) => c.total > 0) ?? counts[0] ?? null;
  const first = picked ? nextLead(picked.niche.id, null, { adjacent }) : null;
  const pickHref = (nicheId: number, adj: boolean) => `/outreach?niche=${nicheId}${adj ? "&adj=1" : ""}`;
  const followUps = getFollowUps();
  const activity = getRecentActivity(15);
  const objections = getObjectionTally();

  const groups: Record<DueBucket, typeof followUps> = { overdue: [], today: [], upcoming: [] };
  for (const f of followUps) if (f.followUp) groups[dueBucket(f.followUp, now)].push(f);
  const due = groups.overdue.length + groups.today.length;

  return (
    <FadeIn className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Outreach</h1>
        <p className="text-sm text-muted-foreground">
          {due > 0 ? `${due} follow-up${due === 1 ? "" : "s"} due now.` : "Nothing due right now."} Log calls from a business&apos;s page.
        </p>
      </div>

      {picked && (
        <section className="space-y-4 rounded-xl border bg-card p-4" aria-label="Ready to call">
          <div>
            <h2 className="text-lg font-semibold">Ready to call</h2>
            <p className="text-sm text-muted-foreground">
              {picked.total === 0
                ? "Nothing to call in this niche right now."
                : `${plural(picked.followUps, "follow-up")} due · ${plural(picked.fresh, "fresh lead")}. Follow-ups come first, then the best scores.`}
            </p>
          </div>

          {counts.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {counts.map((c) => (
                <Link
                  key={c.niche.id}
                  href={pickHref(c.niche.id, adjacent)}
                  className={cn("rounded-full border px-3 py-1 text-sm transition-colors", c.niche.id === picked.niche.id ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}
                >
                  {c.niche.name} <span className="tabular-nums opacity-70">{c.total}</span>
                </Link>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {first ? (
              <Link href={queueUrl(picked.niche.id, first.placeId, adjacent)} className={buttonVariants({ size: "lg" })}>
                <Play /> Start calling
              </Link>
            ) : (
              <span className="text-sm text-muted-foreground">Nothing waiting.</span>
            )}
            <Link href={pickHref(picked.niche.id, !adjacent)} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
              <span className={cn("grid size-4 place-items-center rounded border", adjacent && "border-primary bg-primary text-primary-foreground")}>{adjacent && <Check className="size-3" />}</span>
              Include adjacent businesses
            </Link>
          </div>

          <DailyGoal dials={dialsToday(now)} goal={getDailyGoal()} />
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Follow-ups</h2>
        {followUps.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No follow-ups yet. When you log a call, set a follow-up date and it will show up here.
          </p>
        ) : (
          <div className="space-y-5">
            <Group title="Overdue" tone="text-destructive" rows={groups.overdue} now={now} />
            <Group title="Today" rows={groups.today} now={now} />
            <Group title="Upcoming" rows={groups.upcoming} now={now} />
          </div>
        )}
      </section>

      <div className="grid gap-8 md:grid-cols-2">
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Recent calls</h2>
          {activity.length === 0 ? (
            <p className="text-sm text-muted-foreground">No calls logged yet.</p>
          ) : (
            <ul className="divide-y rounded-lg border text-sm">
              {activity.map((a) => {
                const href = link(a.nicheId, a.placeId);
                return (
                  <li key={a.id} className="px-3 py-2">
                    <div className="flex items-baseline justify-between gap-3">
                      {href ? <Link href={href} className="truncate font-medium hover:underline">{a.title}</Link> : <span className="truncate font-medium">{a.title}</span>}
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {a.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {outcomeLabel(a.outcome)}
                      {a.objection && ` · “${a.objection}”`}
                      {a.nicheName && ` · ${a.nicheName}`}
                    </div>
                    {a.notes && <p className="mt-0.5 line-clamp-2 text-muted-foreground">{a.notes}</p>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Objections</h2>
          {objections.length === 0 ? (
            <p className="text-sm text-muted-foreground">Pick an objection when you log a call and the most common ones add up here.</p>
          ) : (
            <ul className="divide-y rounded-lg border text-sm">
              {objections.map((o) => (
                <li key={o.objection} className="flex items-start justify-between gap-3 px-3 py-2">
                  <div>
                    <div>{o.objection}</div>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {o.offers.map((x) => (
                        <span key={x.offer ?? "none"} className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                          {x.offer ? OFFER_LABEL[x.offer] : "No offer"} × {x.n}
                        </span>
                      ))}
                    </div>
                  </div>
                  <span className="font-semibold tabular-nums">{o.total}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </FadeIn>
  );
}

function Group({
  title,
  rows,
  now,
  tone,
}: {
  title: string;
  rows: ReturnType<typeof getFollowUps>;
  now: Date;
  tone?: string;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className={cn("text-xs font-medium uppercase tracking-wide text-muted-foreground", tone)}>
        {title} · {rows.length}
      </div>
      <ul className="divide-y rounded-lg border">
        {rows.map((f) => {
          const href = link(f.nicheId, f.placeId);
          return (
            <li key={f.logId} className="flex items-center gap-3 px-3 py-2.5">
              <PlaceThumb title={f.title} imageUrl={f.imageUrl} thumbnailUrl={f.thumbnailUrl} logoUrl={f.logoUrl} size={40} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {href ? <Link href={href} className="truncate font-medium hover:underline">{f.title}</Link> : <span className="truncate font-medium">{f.title}</span>}
                  {f.stage && <StageBadge stage={f.stage} />}
                  {f.leadOffer && <OfferChip offer={f.leadOffer} muted />}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  Last: {outcomeLabel(f.outcome)}
                  {f.notes && ` · ${f.notes}`}
                  {f.nicheName && ` · ${f.nicheName}`}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3 text-sm">
                {f.phone && (
                  <a href={`tel:${f.phone}`} className="inline-flex items-center gap-1 whitespace-nowrap text-muted-foreground hover:text-foreground">
                    <Phone className="size-3.5" /> {f.phone}
                  </a>
                )}
                <span className="inline-flex items-center gap-1 whitespace-nowrap text-muted-foreground">
                  <CalendarClock className="size-3.5" /> {f.followUp ? dueLabel(f.followUp, now) : ""}
                </span>
                <FollowUpDone logId={f.logId} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
