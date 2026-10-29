"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

const INTERVAL_MS = 4000;

/**
 * Finishes enrichment runs in the background from any page. The server hands over the ids
 * of runs still in flight, so a refresh or a trip to another page picks up where it left
 * off; once a run is done the ids drop off and polling stops.
 */
export function EnrichPoller({ runIds }: { runIds: number[] }) {
  const router = useRouter();
  const handled = useRef(new Set<number>());
  const key = runIds.join(",");

  useEffect(() => {
    const ids = key ? key.split(",").map(Number) : [];
    if (ids.length === 0) return;
    let stopped = false;

    async function tick() {
      for (const id of ids) {
        if (stopped || handled.current.has(id)) continue;
        try {
          const res = await fetch(`/api/enrich/${id}/sync`, { method: "POST" });
          const d = await res.json();
          if (!res.ok || d.status === "running" || d.status === "ingesting") continue; // not finished, or another poll is applying it: look again next tick
          handled.current.add(id);
          if (d.status === "ingested") {
            const cost = d.costUsd ? `, $${Number(d.costUsd).toFixed(3)}` : "";
            const owners = `${d.owners} owner name${d.owners === 1 ? "" : "s"} found`;
            if (d.kind === "search") {
              toast.success(`Searched ${d.requested} ${d.requested === 1 ? "business" : "businesses"}`, {
                description: `${owners}${cost}.${d.fallbackStarted ? ` Reading ${d.fallbackStarted} website${d.fallbackStarted === 1 ? "" : "s"} for the rest.` : ""}`,
              });
            } else {
              toast.success(`Read ${d.enriched} of ${d.requested} websites`, {
                description: `${owners}${cost}${d.enriched < d.requested ? `. ${d.requested - d.enriched} had nothing readable.` : ""}`,
              });
            }
          } else {
            toast.error(d.status === "aborted" ? "Owner lookup was stopped" : "Owner lookup failed", { description: d.error ?? undefined });
          }
          router.refresh();
        } catch {
          /* offline or server restarting: try again next tick */
        }
      }
    }

    void tick();
    const timer = setInterval(tick, INTERVAL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [key, router]);

  return null;
}
