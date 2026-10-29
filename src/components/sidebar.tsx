import Link from "next/link";
import { Phone, Plus, Radar } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { countDueFollowUps } from "@/lib/outreach-db";
import { listNiches } from "@/lib/queries";

export function Sidebar() {
  const all = listNiches();
  const due = countDueFollowUps();
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r bg-muted/30 md:flex">
      <div className="flex items-center justify-between pr-3">
        <Link href="/" className="flex items-center gap-2 px-5 py-4 text-lg font-semibold">
          <Radar className="size-5 text-blue-600 dark:text-blue-400" /> Leadfinder
        </Link>
        <ThemeToggle />
      </div>
      <div className="px-2 pb-3">
        <Link href="/outreach" className="flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium hover:bg-muted">
          <span className="inline-flex items-center gap-2"><Phone className="size-4" /> Outreach</span>
          {due > 0 && (
            <span className="rounded-full bg-destructive px-1.5 text-xs font-semibold tabular-nums text-white" title={`${due} follow-up${due === 1 ? "" : "s"} due`}>{due}</span>
          )}
        </Link>
      </div>
      <div className="flex items-center justify-between pr-2 pb-1 pl-3">
        <Link href="/" className="text-xs font-medium uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground">
          Niches
        </Link>
        <Link
          href="/niches/new"
          title="New niche"
          aria-label="New niche"
          className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Plus className="size-4" />
        </Link>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2">
        {all.length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground">No niches yet.</p>}
        {all.map((n) => (
          <Link key={n.id} href={`/niches/${n.id}`} className="flex items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-muted">
            <span className="truncate">{n.name}</span>
            <span className="ml-2 text-xs tabular-nums text-muted-foreground">{n.targetCount}</span>
          </Link>
        ))}
      </nav>
    </aside>
  );
}
