"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createNiche, updateNiche } from "@/app/actions";
import { PRESETS, clonePlaybook } from "@/lib/presets";
import { emptyPlaybook, type Playbook } from "@/lib/playbook";
import { lines } from "@/lib/text";
import { cn } from "@/lib/utils";

type Initial = { name: string; presetKey: string | null; target: string; playbook: Playbook };
type Preview = { total: number; target: number; adjacent: number; noise: number; gray: number; samples: string[] };

const selectCls = "h-9 w-full rounded-lg border bg-background px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

export default function NicheForm({ mode, nicheId, initial }: { mode: "create" | "edit"; nicheId?: number; initial: Initial }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState(initial.name);
  const [presetKey, setPresetKey] = useState(initial.presetKey);
  const [target, setTarget] = useState(initial.target);
  const [pb, setPb] = useState<Playbook>(initial.playbook);
  const [preview, setPreview] = useState<Preview | null>(null);

  function applyPreset(key: string | null) {
    setPresetKey(key);
    const p = PRESETS.find((x) => x.key === key);
    if (p) {
      setName((n) => n || p.name);
      setTarget(p.target);
      setPb(clonePlaybook(p.playbook));
    } else {
      setPb(emptyPlaybook());
      setTarget("");
    }
  }

  const set = <K extends keyof Playbook>(k: K, v: Playbook[K]) => setPb((o) => ({ ...o, [k]: v }));
  type ListKey = "seedQueries" | "includeCategories" | "excludeCategories" | "includeKeywords" | "chainExclusions";
  const list = (k: ListKey, label: string, rows = 5, className?: string) => (
    <ListArea key={`${presetKey}-${k}`} label={label} rows={rows} className={className} initial={pb[k]} onChange={(v) => set(k, v)} />
  );

  // Free preview: how many already-scraped places match this draft definition.
  const previewKey = useMemo(() => JSON.stringify(pb), [pb]);
  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/niches/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playbook: pb }),
        });
        if (res.ok) setPreview(await res.json());
      } catch {}
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      try {
        if (mode === "create") {
          const { id } = await createNiche({ name, presetKey, target, playbook: pb });
          toast.success("Niche created");
          router.push(`/niches/${id}`);
        } else {
          await updateNiche(nicheId!, { name, target, playbook: pb });
          toast.success("Playbook saved");
          router.push(`/niches/${nicheId}`);
        }
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not save");
      }
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-5">
        {mode === "create" && (
          <div>
            <Label className="mb-2 block">Start from</Label>
            <div className="grid gap-2 sm:grid-cols-3">
              {[...PRESETS, null].map((p) => {
                const key = p?.key ?? null;
                return (
                  <button
                    type="button"
                    key={key ?? "scratch"}
                    onClick={() => applyPreset(key)}
                    className={cn("rounded-lg border p-3 text-left text-sm transition hover:bg-muted", presetKey === key && "border-blue-600 bg-blue-50 dark:bg-blue-950/30")}
                  >
                    <div className="font-medium">{p?.name ?? "From scratch"}</div>
                    <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{p?.target ?? "Describe the target in your own words."}</div>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">A preset is copied into the niche. Editing the niche later never touches the preset or other niches.</p>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Target</CardTitle>
            <CardDescription>Plain words: who is a good prospect, and who is noise.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="name">Niche name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Epoxy & concrete flooring" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="target">Target definition</Label>
              <Textarea id="target" rows={3} value={target} onChange={(e) => setTarget(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Playbook</CardTitle>
            <CardDescription>One entry per line.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {list("seedQueries", "Seed queries")}
            {list("includeKeywords", "Include keywords (title/domain)")}
            {list("includeCategories", "Include categories")}
            {list("excludeCategories", "Exclude categories")}
            {list("chainExclusions", "Chain exclusion list", 4, "sm:col-span-2")}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Trade profile</CardTitle>
            <CardDescription>Feeds offer-fit scoring. Weights nudge which offer leads; 1 is neutral.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label="Ticket size">
                <select className={selectCls} value={pb.trade.ticketSize} onChange={(e) => set("trade", { ...pb.trade, ticketSize: e.target.value as Playbook["trade"]["ticketSize"] })}>
                  <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
                </select>
              </Field>
              <Field label="Sales cycle">
                <select className={selectCls} value={pb.trade.salesCycle} onChange={(e) => set("trade", { ...pb.trade, salesCycle: e.target.value as Playbook["trade"]["salesCycle"] })}>
                  <option value="days">Days</option><option value="weeks">Weeks</option><option value="months">Months</option>
                </select>
              </Field>
              <Field label="Seasonality">
                <select className={selectCls} value={pb.trade.seasonality} onChange={(e) => set("trade", { ...pb.trade, seasonality: e.target.value as Playbook["trade"]["seasonality"] })}>
                  <option value="flat">Flat</option><option value="seasonal">Seasonal</option>
                </select>
              </Field>
              <Field label="Channel fit">
                <select className={selectCls} value={pb.trade.channelFit} onChange={(e) => set("trade", { ...pb.trade, channelFit: e.target.value as Playbook["trade"]["channelFit"] })}>
                  <option value="meta">Meta</option><option value="search">Search</option><option value="both">Both</option>
                </select>
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-5">
              {(["facebook_ads", "speed_to_lead", "db_reactivation", "review_system", "website"] as const).map((o) => (
                <Field key={o} label={{ facebook_ads: "FB ads", speed_to_lead: "Speed to lead", db_reactivation: "Reactivation", review_system: "Reviews", website: "Website" }[o]}>
                  <Input type="number" step="0.1" min={0} max={2} value={pb.offerWeights[o] ?? 1} onChange={(e) => set("offerWeights", { ...pb.offerWeights, [o]: Math.min(2, Math.max(0, Number(e.target.value))) })} />
                </Field>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-2">
          <Button type="submit" disabled={pending || !name.trim()}>
            {pending && <Loader2 className="animate-spin" />} {mode === "create" ? "Create niche" : "Save playbook"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => router.back()}>Cancel</Button>
        </div>
      </div>

      <aside className="lg:sticky lg:top-6 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Sparkles className="size-4 text-blue-600 dark:text-blue-400" /> Free preview</CardTitle>
            <CardDescription>Already-scraped places that match this definition. No new run needed.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            {!preview ? (
              <p className="text-muted-foreground">Calculating…</p>
            ) : preview.total === 0 ? (
              <p className="text-muted-foreground">No places scraped yet. Your first run will fill this in.</p>
            ) : (
              <>
                <div className="text-3xl font-semibold tabular-nums">{preview.target.toLocaleString()}</div>
                <div className="text-muted-foreground">of {preview.total.toLocaleString()} known places look like targets</div>
                <dl className="mt-3 grid grid-cols-2 gap-y-1">
                  <dt className="text-muted-foreground">Gray zone</dt><dd className="text-right tabular-nums">{preview.gray}</dd>
                  <dt className="text-muted-foreground">Noise</dt><dd className="text-right tabular-nums">{preview.noise}</dd>
                </dl>
                {preview.samples.length > 0 && (
                  <ul className="mt-3 space-y-0.5 text-xs text-muted-foreground">
                    {preview.samples.map((s) => <li key={s} className="truncate">{s}</li>)}
                  </ul>
                )}
                <p className="mt-3 text-xs text-muted-foreground">Rules only. Gray-zone rows get an LLM pass later.</p>
              </>
            )}
          </CardContent>
        </Card>
      </aside>
    </form>
  );
}

/** Keeps the raw text locally so Enter and trailing blanks survive; reports the cleaned list upward. */
function ListArea({ label, initial, onChange, rows, className }: { label: string; initial: string[]; onChange: (v: string[]) => void; rows: number; className?: string }) {
  const [text, setText] = useState(initial.join("\n"));
  return (
    <Field label={label} className={className}>
      <Textarea
        rows={rows}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(lines(e.target.value));
        }}
      />
    </Field>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}
