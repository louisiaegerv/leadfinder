"use client";

import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** A small (i) icon that explains a term on hover or keyboard focus. */
export function InfoTip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger
        aria-label={`What is ${label}?`}
        className="inline-flex size-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
      >
        <Info className="size-3.5" />
      </TooltipTrigger>
      <TooltipContent side="top" className="block max-w-72 space-y-1.5 py-2 text-left leading-snug">
        {children}
      </TooltipContent>
    </Tooltip>
  );
}
