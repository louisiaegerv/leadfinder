import Link from "next/link";
import { Plus, Radar } from "lucide-react";
import { listNiches } from "@/lib/queries";

export function Sidebar() {
  const all = listNiches();
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r bg-muted/30 md:flex">
      <Link href="/" className="flex items-center gap-2 px-5 py-4 text-lg font-semibold">
        <Radar className="size-5 text-blue-600" /> Leadfinder
      </Link>
      <div className="px-3 pb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Niches</div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2">
        {all.length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground">No niches yet.</p>}
        {all.map((n) => (
          <Link key={n.id} href={`/niches/${n.id}`} className="flex items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-muted">
            <span className="truncate">{n.name}</span>
            <span className="ml-2 text-xs tabular-nums text-muted-foreground">{n.targetCount}</span>
          </Link>
        ))}
      </nav>
      <Link href="/niches/new" className="m-3 flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
        <Plus className="size-4" /> New niche
      </Link>
    </aside>
  );
}
