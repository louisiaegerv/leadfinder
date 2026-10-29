import { STAGE_LABEL } from "@/lib/outreach";
import type { Stage } from "@/lib/offers";
import { cn } from "@/lib/utils";

export const STAGE_STYLE: Record<Stage, string> = {
  new: "bg-muted text-muted-foreground",
  dialed: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  conversation: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  booked: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
  held: "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-950 dark:text-fuchsia-200",
  proposal: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200",
  won: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  lost: "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

export function StageBadge({ stage, className }: { stage: Stage; className?: string }) {
  return (
    <span className={cn("inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", STAGE_STYLE[stage], className)}>
      {STAGE_LABEL[stage]}
    </span>
  );
}
