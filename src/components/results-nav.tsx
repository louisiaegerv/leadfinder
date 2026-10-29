import Link from "next/link";
import { Map as MapIcon, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** Table | Map switch that keeps the current filters. */
export function ResultsNav({ nicheId, active, qs }: { nicheId: number; active: "table" | "map"; qs: string }) {
  const item = (href: string, on: boolean, icon: React.ReactNode, label: string) => (
    <Link href={qs ? `${href}?${qs}` : href} className={cn("inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition", on ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
      {icon} {label}
    </Link>
  );
  return (
    <div className="inline-flex rounded-lg border p-0.5">
      {item(`/niches/${nicheId}/places`, active === "table", <Table2 className="size-4" />, "Table")}
      {item(`/niches/${nicheId}/map`, active === "map", <MapIcon className="size-4" />, "Map")}
    </div>
  );
}
