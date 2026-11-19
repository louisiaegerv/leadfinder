"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const selectCls =
  "h-9 rounded-lg border bg-background px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

const STATUS_LABEL = { all: "Any outcome", ingested: "Succeeded", failed: "Failed or aborted" } as const;

/** URL-driven filters for the Areas and Runs tabs, so every view is a link and survives a refresh. */
export function NicheListFilters({
  basePath,
  search,
  areas,
  status,
}: {
  basePath: string;
  /** Show a name search (areas tab). */
  search?: boolean;
  /** Show an area picker (runs tab). */
  areas?: { id: number; name: string }[];
  /** Show an outcome picker (runs tab). */
  status?: boolean;
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
    router.replace(qs ? `${basePath}?${qs}` : basePath, { scroll: false });
  }

  const active = ["q", "area", "status"].some((k) => sp.get(k));

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        go({ q: q.trim() || null });
      }}
    >
      {search && (
        <div className="relative">
          <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
          <Input className="w-56 pl-8" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search areas" />
        </div>
      )}
      {areas && (
        <select className={selectCls} value={sp.get("area") ?? ""} onChange={(e) => go({ area: e.target.value || null })} aria-label="Area">
          <option value="">All areas</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      )}
      {status && (
        <select className={selectCls} value={sp.get("status") ?? "all"} onChange={(e) => go({ status: e.target.value === "all" ? null : e.target.value })} aria-label="Outcome">
          {Object.entries(STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
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
            const next = new URLSearchParams(sp.toString());
            for (const k of ["q", "area", "status", "page"]) next.delete(k);
            const qs = next.toString();
            router.replace(qs ? `${basePath}?${qs}` : basePath, { scroll: false });
          }}
        >
          <X /> Clear
        </Button>
      )}
    </form>
  );
}
