"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Globe, Loader2, ScanSearch, UserSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ENRICH_PRICE_USD } from "@/lib/enrich";
import { showScanResult } from "@/components/scan-toast";

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
}: {
  placeId: string;
  method?: "scan" | "search" | "site";
  fallback?: boolean;
  /** Why this can't be run for this business (do-not-contact, no website), or null when it can. */
  blockedReason: string | null;
  /** Already looked up once, so the button offers to do it again. */
  done: boolean;
  running: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    try {
      const res = await fetch("/api/enrich/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeIds: [placeId], method, fallback: method !== "site" && fallback }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Could not start the lookup");
      if (method === "scan") showScanResult(d);
      else toast.info(method === "search" ? "Searching…" : "Reading the website…", { description: "This usually takes under a minute. You can keep working." });
      router.refresh(); // shows the result, and hands any new run to the background poller
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start the lookup");
    } finally {
      setBusy(false);
    }
  }

  const working = busy || running;
  const tip =
    method === "scan"
      ? "Reads the website directly (free): social links, emails, phone numbers, and signals like no mobile site or no contact form."
      : method === "search"
      ? `Searches Google for the owner (about $0.001)${fallback ? `. If that finds nobody, reads the website too (about $${ENRICH_PRICE_USD}).` : "."}`
      : `Reads the business's website for the owner, emails and phone numbers (about $${ENRICH_PRICE_USD}).`;
  const Icon = method === "scan" ? ScanSearch : method === "search" ? UserSearch : Globe;
  const label =
    method === "scan" ? (done ? "Scan again" : "Scan website") : method === "search" ? (done ? "Search again" : "Find owner") : done ? "Re-read website" : "Paid website reader";

  return (
    <Button variant="outline" size="sm" onClick={start} disabled={working || blockedReason != null} title={blockedReason ?? tip} className="h-[30px]">
      {working ? <Loader2 className="animate-spin" /> : <Icon />}
      {working ? (method === "scan" ? "Scanning…" : "Working…") : label}
    </Button>
  );
}
