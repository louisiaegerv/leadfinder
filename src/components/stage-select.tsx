"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { setStage } from "@/app/actions";
import { STAGES, type Stage } from "@/lib/offers";
import { STAGE_LABEL } from "@/lib/outreach";
import { cn } from "@/lib/utils";
import { STAGE_STYLE } from "@/components/stage-badge";

/** The stage as a coloured dropdown, for moves a logged call can't make (held, proposal, won). */
export function StageSelect({ nicheId, placeId, stage }: { nicheId: number; placeId: string; stage: Stage }) {
  const [pending, start] = useTransition();
  return (
    <select
      aria-label="Pipeline stage"
      value={stage}
      disabled={pending}
      onChange={(e) =>
        start(async () => {
          await setStage(nicheId, placeId, e.target.value as Stage);
          toast.success(`Stage: ${STAGE_LABEL[e.target.value as Stage]}`);
        })
      }
      className={cn("h-7 cursor-pointer rounded-full border-0 px-2.5 text-xs font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50", STAGE_STYLE[stage])}
    >
      {STAGES.map((s) => (
        <option key={s} value={s} className="bg-background text-foreground">
          {STAGE_LABEL[s]}
        </option>
      ))}
    </select>
  );
}
