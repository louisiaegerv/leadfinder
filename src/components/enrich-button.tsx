"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Globe, Loader2, Megaphone, ScanSearch, Star, UserSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ENRICH_PRICE_USD } from "@/lib/enrich";
import { showScanResult } from "@/components/scan-toast";

/** What to tell you before a paid lookup runs. Pass it to make the button ask first. */
export type ConfirmDetails = {
  /** Plain sentences about what will happen. */
  lines: string[];
  /** The most it can cost, in dollars. Null when it is free. */
  costUsd: number | null;
};

const money = (n: number) => `$${n < 0.01 ? n.toFixed(4) : n.toFixed(3)}`;

/**
 * One-business lookups. "scan" reads the website directly with plain HTTP (free): social links, emails,
 * phones and site signals. "search" googles for the owner (about a tenth of a cent) and, with `fallback`,
 * reads the website too when that finds nobody. "site" is the paid website reader (about $0.015), the
 * second pass for sites the scan can't read.
 */
export function EnrichButton({
  placeId,
  method = "search",
  fallback = true,
  blockedReason,
  done,
  running,
  confirm,
}: {
  placeId: string;
  method?: "scan" | "search" | "facebook" | "reviews" | "site";
  fallback?: boolean;
  /** Why this can't be run for this business (do-not-contact, no website), or null when it can. */
  blockedReason: string | null;
  /** Already looked up once, so the button offers to do it again. */
  done: boolean;
  running: boolean;
  /** When set, clicking shows these details and waits for a yes before spending anything. */
  confirm?: ConfirmDetails;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);

  async function start() {
    setBusy(true);
    try {
      const res = await fetch("/api/enrich/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeIds: [placeId], method, fallback: (method === "scan" || method === "search") && fallback }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Could not start the lookup");
      if (method === "scan") showScanResult(d);
      else toast.info(method === "search" ? "Searching…" : method === "facebook" ? "Looking for the Facebook page…" : method === "reviews" ? "Fetching reviews…" : "Reading the website…", { description: "This usually takes under a minute. You can keep working." });
      router.refresh(); // shows the result, and hands any new run to the background poller
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start the lookup");
    } finally {
      setBusy(false);
    }
  }

  const working = busy || running;
  const tip =
    method === "reviews"
      ? "Fetches the newest 5 Google reviews of just this business (about $0.002)."
      : method === "facebook"
      ? "Googles the business's name, city and state plus “Facebook” to find its page (about $0.0005)."
      : method === "scan"
      ? "Reads the website directly (free): social links, emails, phone numbers, and signals like no mobile site or no contact form."
      : method === "search"
      ? `Searches Google for the owner (about $0.001)${fallback ? `. If that finds nobody, reads the website too (about $${ENRICH_PRICE_USD}).` : "."}`
      : `Reads the business's website for the owner, emails and phone numbers (about $${ENRICH_PRICE_USD}).`;
  const Icon = method === "scan" ? ScanSearch : method === "search" ? UserSearch : method === "facebook" ? Megaphone : method === "reviews" ? Star : Globe;
  const label =
    method === "reviews" ? (done ? "Refresh reviews" : "Fetch reviews") : method === "facebook" ? (done ? "Search again" : "Find Facebook page") : method === "scan" ? (done ? "Scan again" : "Scan website") : method === "search" ? (done ? "Search again" : "Find owner") : done ? "Re-read website" : "Paid website reader";

  async function confirmed() {
    await start();
    setAsking(false);
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={confirm ? () => setAsking(true) : start} disabled={working || blockedReason != null} title={blockedReason ?? tip} className="h-[30px]">
        {working ? <Loader2 className="animate-spin" /> : <Icon />}
        {working ? (method === "scan" ? "Scanning…" : "Working…") : label}
      </Button>
      {confirm && (
        <Dialog open={asking} onOpenChange={(o) => !busy && setAsking(o)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{label}?</DialogTitle>
              <DialogDescription>{confirm.costUsd == null ? "This is free." : `This costs up to about ${money(confirm.costUsd)}.`}</DialogDescription>
            </DialogHeader>
            <ul className="list-disc space-y-1.5 pl-5 text-sm">
              {confirm.lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAsking(false)} disabled={busy}>Cancel</Button>
              <Button onClick={confirmed} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <Icon />} {label}{confirm.costUsd != null ? ` · up to ${money(confirm.costUsd)}` : ""}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
