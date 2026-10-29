"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CalendarClock, Loader2, Phone, Trash2 } from "lucide-react";
import { deleteCallEntry, logCall } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { OFFER_LABEL, OFFERS, type OfferKey } from "@/lib/offers";
import { OBJECTIONS, OUTCOMES, OUTCOME_INFO, STAGE_LABEL, TERMINAL_OUTCOMES, addDays, toDateInput, type Outcome } from "@/lib/outreach";
import { cn } from "@/lib/utils";

export type LogEntry = {
  id: number;
  outcome: string;
  notes: string | null;
  objection: string | null;
  offer: OfferKey | null;
  followUp: number | null; // ms
  createdAt: number; // ms
  nicheName: string | null;
};

const selectCls = "h-9 w-full rounded-lg border bg-background px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
const QUICK = [
  { label: "Tomorrow", days: 1 },
  { label: "3 days", days: 3 },
  { label: "1 week", days: 7 },
  { label: "2 weeks", days: 14 },
];

const fmt = (ms: number, opts: Intl.DateTimeFormatOptions) => new Date(ms).toLocaleString("en-US", opts);

export function CallLogPanel({
  nicheId,
  placeId,
  defaultOffer,
  entries,
}: {
  nicheId: number;
  placeId: string;
  defaultOffer: OfferKey | null;
  entries: LogEntry[];
}) {
  const [pending, start] = useTransition();
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [notes, setNotes] = useState("");
  const [objection, setObjection] = useState("");
  const [offer, setOffer] = useState<OfferKey | "">(defaultOffer ?? "");
  const [followUp, setFollowUp] = useState("");

  const terminal = outcome != null && TERMINAL_OUTCOMES.includes(outcome);

  function pick(o: Outcome) {
    setOutcome(o);
    // Suggest a date for the new outcome; the user can change it.
    const days = OUTCOME_INFO[o].followUpDays;
    setFollowUp(days == null ? "" : toDateInput(addDays(new Date(), days)));
  }

  function submit() {
    if (!outcome) return;
    start(async () => {
      try {
        const { stage } = await logCall({
          nicheId,
          placeId,
          outcome,
          notes: notes || null,
          objection: objection || null,
          offer: offer || null,
          followUp: terminal ? null : followUp || null,
        });
        toast.success(`Logged. Stage: ${STAGE_LABEL[stage]}`);
        setOutcome(null);
        setNotes("");
        setObjection("");
        setFollowUp("");
      } catch {
        toast.error("Could not log the call");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Phone className="size-4" /> Call log</CardTitle>
        <CardDescription>Shared across niches, so one business never gets two separate histories.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
          <div className="flex flex-wrap gap-1.5">
            {OUTCOMES.map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => pick(o)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs transition",
                  outcome === o ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
                )}
              >
                {OUTCOME_INFO[o].label}
              </button>
            ))}
          </div>

          {outcome && (
            <>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes: who you spoke to, what they said…" rows={3} />
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="space-y-1 text-xs text-muted-foreground">
                  Offer you pitched
                  <select className={selectCls} value={offer} onChange={(e) => setOffer(e.target.value as OfferKey | "")}>
                    <option value="">None</option>
                    {OFFERS.map((o) => <option key={o} value={o}>{OFFER_LABEL[o]}</option>)}
                  </select>
                </label>
                <label className="space-y-1 text-xs text-muted-foreground">
                  Objection raised
                  <select className={selectCls} value={objection} onChange={(e) => setObjection(e.target.value)}>
                    <option value="">None</option>
                    {OBJECTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </label>
              </div>

              {!terminal && (
                <div className="space-y-1.5">
                  <div className="text-xs text-muted-foreground">Follow up on</div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Input type="date" value={followUp} onChange={(e) => setFollowUp(e.target.value)} className="w-40" />
                    {QUICK.map((q) => (
                      <Button key={q.days} type="button" variant="outline" size="sm" onClick={() => setFollowUp(toDateInput(addDays(new Date(), q.days)))}>
                        {q.label}
                      </Button>
                    ))}
                    {followUp && <Button type="button" variant="ghost" size="sm" onClick={() => setFollowUp("")}>No date</Button>}
                  </div>
                </div>
              )}
              {outcome === "dnc" && <p className="text-xs text-destructive">This also marks the business do-not-contact in every niche.</p>}

              <Button onClick={submit} disabled={pending}>
                {pending && <Loader2 className="animate-spin" />} Log call
              </Button>
            </>
          )}
          {!outcome && <p className="text-xs text-muted-foreground">Pick what happened to log a call.</p>}
        </div>

        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No calls logged yet.</p>
        ) : (
          <ol className="space-y-3">
            {entries.map((e) => (
              <li key={e.id} className="group border-l-2 pl-3 text-sm">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="font-medium">{OUTCOME_INFO[e.outcome as Outcome]?.label ?? e.outcome}</span>
                  <span className="text-xs text-muted-foreground" suppressHydrationWarning>
                    {fmt(e.createdAt, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </span>
                  {e.nicheName && <span className="text-xs text-muted-foreground">· {e.nicheName}</span>}
                  <button
                    type="button"
                    aria-label="Delete entry"
                    className="ml-auto text-muted-foreground opacity-0 transition hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
                    onClick={() => {
                      if (!confirm("Delete this log entry? The stage is not changed.")) return;
                      void deleteCallEntry(e.id).then(() => toast.success("Entry deleted"));
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
                {e.notes && <p className="mt-0.5 whitespace-pre-wrap text-muted-foreground">{e.notes}</p>}
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                  {e.offer && <span className="rounded bg-muted px-1.5 py-0.5">{OFFER_LABEL[e.offer]}</span>}
                  {e.objection && <span className="rounded bg-muted px-1.5 py-0.5">“{e.objection}”</span>}
                  {e.followUp != null && (
                    <span className="inline-flex items-center gap-1 text-muted-foreground" suppressHydrationWarning>
                      <CalendarClock className="size-3" /> follow up {fmt(e.followUp, { month: "short", day: "numeric" })}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
