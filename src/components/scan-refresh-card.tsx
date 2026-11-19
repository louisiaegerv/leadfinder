"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AutoScanState } from "@/lib/site-scan-db";

/** Offers to read the websites scanned before descriptions were kept, and shows how that is going. Renders nothing when there is nothing to do. */
export function ScanRefreshCard({ nicheId, pending, state }: { nicheId: number; pending: number; state: AutoScanState | null }) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const scanning = state?.state === "scanning";
  const was = useRef(scanning);

  // Keep the page fresh while it runs, and say so when it finishes.
  useEffect(() => {
    if (!scanning) return;
    const id = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(id);
  }, [scanning, router]);
  useEffect(() => {
    if (was.current && !scanning && state?.state === "done") toast.success("Website info refreshed", { description: `${state.scanned} sites scanned, ${state.read} readable` });
    was.current = scanning;
  }, [scanning, state]);

  async function start() {
    setStarting(true);
    try {
      const res = await fetch(`/api/niches/${nicheId}/rescan`, { method: "POST" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Could not start the refresh");
      toast.info(`Refreshing ${d.total} websites in the background`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start the refresh");
    } finally {
      setStarting(false);
    }
  }

  if (scanning) {
    return (
      <div className="flex items-center gap-3 rounded-lg border p-4 text-sm">
        <Loader2 className="size-4 shrink-0 animate-spin" />
        <div>
          <div className="font-medium">Refreshing website info: {state.done.toLocaleString("en-US")} of {state.total.toLocaleString("en-US")}</div>
          <div className="text-xs text-muted-foreground">Runs in the background and saves as it goes. You can leave this page; closing the app stops it, and you can start it again.</div>
        </div>
      </div>
    );
  }
  if (pending === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4 text-sm">
      <div className="max-w-2xl">
        <div className="font-medium">{pending.toLocaleString("en-US")} websites need their info read</div>
        <div className="text-xs text-muted-foreground">
          These were scanned before descriptions were kept, or never scanned. Reading them adds what each site says about itself (used by the AI classifier and shown on the Details tab),
          lets keywords on the site settle businesses the rules could not, and catches quote forms added by script. It is free and refreshes labels and scores as it goes.
          Businesses marked noise because of a chain, an excluded category or a decision by the AI or you are skipped; noise from having no matching category or keyword is included.
          {state?.state === "interrupted" && ` An earlier refresh stopped at ${state.done} of ${state.total}.`}
          {state?.state === "error" && ` The last refresh failed: ${state.message}`}
        </div>
      </div>
      <Button variant="outline" onClick={start} disabled={starting}>
        {starting ? <Loader2 className="animate-spin" /> : <RefreshCw />} Refresh in the background
      </Button>
    </div>
  );
}
