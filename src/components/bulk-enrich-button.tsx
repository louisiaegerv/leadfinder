"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { showScanResult } from "@/components/scan-toast";
import { cn } from "@/lib/utils";

type Method = "scan" | "search" | "site";

type Preview = {
  matching: number;
  eligible: number;
  alreadyDone: number;
  noWebsite: number;
  doNotContact: number;
  inProgress: number;
  withWebsite: number;
  maxPerClick: number;
  pricePerBusiness: number;
  fallbackPrice: number;
};

const DEFAULT_COUNT = 25;
const money = (n: number) => `$${n < 0.1 ? n.toFixed(3) : n.toFixed(2)}`;

const METHODS: { key: Method; title: string; blurb: string }[] = [
  { key: "scan", title: "Quick scan", blurb: "Free. Reads each website directly: social links, emails, phone numbers, and signals like no mobile site or contact form." },
  { key: "search", title: "Search the web", blurb: "About a tenth of a cent each. Finds owner names, works without a website, and can find their LinkedIn." },
  { key: "site", title: "Paid website reader", blurb: "About a cent and a half each. Also handles JavaScript-built sites: owner, emails, phones, services." },
];

/** Enrich the best-scoring businesses the table is showing: scan sites, search for owners, or use the paid reader. */
export function BulkEnrichButton({ nicheId, running }: { nicheId: number; running: boolean }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [method, setMethod] = useState<Method>("scan");
  const [fallback, setFallback] = useState(true);
  const [loaded, setLoaded] = useState<{ key: string; data: Preview } | null>(null);
  const [count, setCount] = useState(DEFAULT_COUNT);
  const typedCount = useRef(false); // once you pick a number, switching method keeps it (within what is available)

  // The filters in the URL, minus paging, define who "the table" is.
  const filters = Object.fromEntries([...sp.entries()].filter(([k]) => k !== "page"));
  const filterKey = JSON.stringify(filters);
  // What was loaded counts only for the filters and method it was loaded for; otherwise we are "checking".
  const key = `${nicheId}|${method}|${filterKey}`;
  const preview = loaded?.key === key ? loaded.data : null;

  useEffect(() => {
    if (!open) return;
    let stale = false;
    const qs = new URLSearchParams({ ...(JSON.parse(filterKey) as Record<string, string>), niche: String(nicheId), method });
    fetch(`/api/enrich/preview?${qs}`)
      .then((r) => r.json() as Promise<Preview>)
      .then((p) => {
        if (stale) return;
        setLoaded({ key: `${nicheId}|${method}|${filterKey}`, data: p });
        // Scanning is free, so by default it covers everyone who needs it (that is what makes it a backfill).
        const fallbackDefault = method === "scan" ? p.eligible : DEFAULT_COUNT;
        setCount((c) => Math.max(1, Math.min(typedCount.current ? c : fallbackDefault, p.eligible, p.maxPerClick)));
      })
      .catch(() => {
        if (stale) return;
        toast.error("Could not check which businesses can be looked up");
        setOpen(false);
      });
    return () => {
      stale = true;
    };
  }, [open, method, nicheId, filterKey]);

  const max = preview ? Math.min(preview.eligible, preview.maxPerClick) : 0;
  const n = Math.max(1, Math.min(count || 1, max || 1));
  const cost = preview ? n * preview.pricePerBusiness : 0;
  const worstExtra = method !== "site" && fallback && preview ? Math.min(n, preview.withWebsite) * preview.fallbackPrice : 0;

  async function run() {
    setBusy(true);
    try {
      const res = await fetch("/api/enrich/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nicheId, filters, limit: n, method, fallback: method !== "site" && fallback }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Could not start the lookup");
      if (method === "scan") showScanResult(d);
      else toast.info(`Looking up ${d.count} businesses…`, { description: "This runs in the background. Results appear as it finishes." });
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start the lookup");
    } finally {
      setBusy(false);
    }
  }

  const verb = method === "scan" ? "Scan" : "Look up";
  return (
    <>
      <Button variant="outline" onClick={() => { typedCount.current = false; setOpen(true); }} disabled={running} title={running ? "An owner lookup is already in progress" : undefined}>
        {running ? <Loader2 className="animate-spin" /> : <Sparkles />} {running ? "Looking up…" : "Enrich"}
      </Button>
      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Enrich these prospects?</DialogTitle>
            <DialogDescription>
              Best scores first, from what the table is showing now. You are only charged for lookups that run, and a result never replaces a name you typed.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2 sm:grid-cols-3">
            {METHODS.map((m) => (
              <button
                key={m.key}
                type="button"
                disabled={busy}
                onClick={() => setMethod(m.key)}
                className={cn("rounded-lg border p-3 text-left text-sm transition", method === m.key ? "border-primary ring-2 ring-primary/20" : "hover:bg-muted")}
              >
                <div className="font-medium">{m.title}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{m.blurb}</div>
              </button>
            ))}
          </div>

          {!preview ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Checking…</div>
          ) : preview.eligible === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">
              Nobody to look up here. {preview.alreadyDone > 0 && `${preview.alreadyDone} already done. `}
              {preview.noWebsite > 0 && `${preview.noWebsite} have no business website. `}
              {preview.inProgress > 0 && `${preview.inProgress} are being looked up now.`}
            </p>
          ) : (
            <div className="space-y-3 text-sm">
              <p>
                <b>{preview.eligible}</b> of {preview.matching} can be {method === "scan" ? "scanned" : "looked up"}
                <span className="text-muted-foreground">
                  {preview.alreadyDone > 0 && ` · ${preview.alreadyDone} already done`}
                  {preview.noWebsite > 0 && ` · ${preview.noWebsite} with no website`}
                  {preview.doNotContact > 0 && ` · ${preview.doNotContact} do-not-contact`}
                  {preview.inProgress > 0 && ` · ${preview.inProgress} in progress`}
                </span>
              </p>
              <label className="flex items-center gap-2">
                How many?
                <Input
                  type="number"
                  min={1}
                  max={max}
                  value={count}
                  disabled={busy}
                  onChange={(e) => { typedCount.current = true; setCount(Number(e.target.value)); }}
                  className="w-24"
                />
                <span className="text-muted-foreground">of {max} (one click is capped at {preview.maxPerClick})</span>
              </label>
              {method !== "site" && (
                <label className="flex items-start gap-2">
                  <input type="checkbox" checked={fallback} disabled={busy} onChange={(e) => setFallback(e.target.checked)} className="mt-0.5" />
                  <span>
                    {method === "scan"
                      ? "Send sites the scan can't read (JavaScript-built or blocking) to the paid website reader"
                      : "If the search finds no owner, read the business's website too"}
                    <span className="block text-xs text-muted-foreground">
                      Adds {money(preview.fallbackPrice)} only for {method === "scan" ? "those sites, usually about a fifth of them" : "businesses where the search came up empty"}.
                    </span>
                  </span>
                </label>
              )}
              <p className="font-medium">
                Estimated cost: {cost === 0 ? "free" : money(cost)}
                {worstExtra > 0 && <span className="font-normal text-muted-foreground"> (up to {money(worstExtra)} more if the paid reader is needed for all)</span>}
              </p>
              {busy && method === "scan" && <p className="text-xs text-muted-foreground">Scanning can take a minute for a big batch. Results are saved as each site finishes.</p>}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={run} disabled={busy || !preview || preview.eligible === 0}>
              {busy ? <Loader2 className="animate-spin" /> : <Sparkles />} {busy && method === "scan" ? "Scanning…" : verb} {preview && preview.eligible > 0 ? `${n} · ${cost === 0 ? "free" : `~${money(cost)}`}` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
