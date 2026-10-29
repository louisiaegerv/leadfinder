"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OFFER_LABEL, OFFERS, STAGES } from "@/lib/offers";
import { STAGE_LABEL } from "@/lib/outreach";

const selectCls =
  "h-9 rounded-lg border bg-background px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

const REL_LABEL: Record<string, string> = {
  pipeline: "Prospects (target + adjacent + undecided)",
  target: "Targets only",
  adjacent: "Adjacent only",
  gray: "Undecided (gray zone)",
  noise: "Noise",
  all: "Everything",
};

/** URL-driven filters, so every view is a shareable, back-button-friendly link. */
export function PlacesFilters({
  basePath,
  areas,
}: {
  basePath: string;
  areas: { id: number; name: string }[];
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");

  function go(patch: Record<string, string | null>) {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete("page"); // any filter change goes back to page 1
    const qs = next.toString();
    router.replace(qs ? `${basePath}?${qs}` : basePath);
  }

  const active = ["rel", "area", "offer", "stage", "q"].some((k) => sp.get(k));

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        go({ q: q.trim() || null });
      }}
    >
      <div className="relative">
        <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
        <Input className="w-56 pl-8" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name" />
      </div>
      <select className={selectCls} value={sp.get("rel") ?? "pipeline"} onChange={(e) => go({ rel: e.target.value === "pipeline" ? null : e.target.value })} aria-label="Relevance">
        {Object.entries(REL_LABEL).map(([k, v]) => (
          <option key={k} value={k}>{v}</option>
        ))}
      </select>
      <select className={selectCls} value={sp.get("offer") ?? ""} onChange={(e) => go({ offer: e.target.value || null })} aria-label="Lead offer">
        <option value="">Any lead offer</option>
        {OFFERS.map((o) => (
          <option key={o} value={o}>{OFFER_LABEL[o]}</option>
        ))}
      </select>
      <select className={selectCls} value={sp.get("stage") ?? ""} onChange={(e) => go({ stage: e.target.value || null })} aria-label="Stage">
        <option value="">Any stage</option>
        {STAGES.map((s) => (
          <option key={s} value={s}>{STAGE_LABEL[s]}</option>
        ))}
      </select>
      {areas.length > 1 && (
        <select className={selectCls} value={sp.get("area") ?? ""} onChange={(e) => go({ area: e.target.value || null })} aria-label="Area">
          <option value="">All areas</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      )}
      {active && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setQ("");
            router.replace(basePath);
          }}
        >
          <X /> Clear
        </Button>
      )}
    </form>
  );
}
