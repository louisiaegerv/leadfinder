"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type RunRow = {
  id: number;
  areaName: string;
  status: string;
  resultCount: number | null;
  newPlaceCount: number | null;
  costUsd: number | null;
  estimatedCostUsd: number | null;
  error: string | null;
  createdAt: number;
};

const ACTIVE = new Set(["running", "pending", "succeeded"]); // succeeded = awaiting ingest
const POLL_MS = 6000;

export function RunList({ runs }: { runs: RunRow[] }) {
  const router = useRouter();
  const polling = useRef(new Set<number>());

  useEffect(() => {
    const active = runs.filter((r) => ACTIVE.has(r.status));
    if (active.length === 0) return;
    const tick = async () => {
      let changed = false;
      for (const r of active) {
        if (polling.current.has(r.id)) continue;
        polling.current.add(r.id);
        try {
          const res = await fetch(`/api/runs/${r.id}/sync`, { method: "POST" });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
          if (data.run.status !== r.status) {
            changed = true;
            if (data.run.status === "ingested") {
              toast.success(`Run #${r.id} finished`, {
                description: `${data.run.resultCount} places, ${data.run.newPlaceCount} new to this niche`,
              });
            } else if (data.run.status === "failed" || data.run.status === "aborted") {
              toast.error(`Run #${r.id} ${data.run.status}`, { description: data.run.error ?? undefined });
            }
          }
        } catch (e) {
          console.error(e);
        } finally {
          polling.current.delete(r.id);
        }
      }
      if (changed) router.refresh();
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => clearInterval(id);
  }, [runs, router]);

  if (runs.length === 0) return <p className="text-sm text-muted-foreground">No runs yet. Add an area and launch one.</p>;

  return (
    <div className="overflow-hidden rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2">Run</th>
            <th className="px-3 py-2">Area</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2 text-right">Results</th>
            <th className="px-3 py-2 text-right">New</th>
            <th className="px-3 py-2 text-right">Cost</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="px-3 py-2 tabular-nums">#{r.id}</td>
              <td className="px-3 py-2">{r.areaName}</td>
              <td className="px-3 py-2">
                <Badge variant={r.status === "ingested" ? "secondary" : r.status === "failed" ? "destructive" : "outline"}>
                  {ACTIVE.has(r.status) && <Loader2 className="mr-1 size-3 animate-spin" />}
                  {r.status === "succeeded" ? "ingesting" : r.status}
                </Badge>
                {r.error && <div className="mt-1 max-w-xs truncate text-xs text-destructive" title={r.error}>{r.error}</div>}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{r.resultCount ?? "–"}</td>
              <td className="px-3 py-2 text-right tabular-nums">{r.newPlaceCount ?? "–"}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {r.costUsd != null ? `$${r.costUsd.toFixed(3)}` : r.estimatedCostUsd != null ? `~$${r.estimatedCostUsd.toFixed(2)}` : "–"}
              </td>
              <td className="px-3 py-2 text-right">
                {(r.status === "running" || r.status === "pending") && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      const res = await fetch(`/api/runs/${r.id}/abort`, { method: "POST" });
                      if (res.ok) toast.info(`Aborting run #${r.id}`);
                      else toast.error((await res.json()).error);
                    }}
                  >
                    Abort
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
