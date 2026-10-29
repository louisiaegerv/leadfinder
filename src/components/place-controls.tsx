"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Ban, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setDoNotContact, setRelevance } from "@/app/actions";
import { cn } from "@/lib/utils";

type Rel = "target" | "adjacent" | "noise";
const OPTIONS: { key: Rel | "auto"; label: string }[] = [
  { key: "target", label: "Target" },
  { key: "adjacent", label: "Adjacent" },
  { key: "noise", label: "Noise" },
  { key: "auto", label: "Auto" },
];

export function PlaceControls({
  nicheId,
  placeId,
  relevance,
  source,
  reason,
  doNotContact,
}: {
  nicheId: number;
  placeId: string;
  relevance: Rel | null;
  source: "rules" | "llm" | "user" | null;
  reason: string | null;
  doNotContact: boolean;
}) {
  const [pending, start] = useTransition();

  const setRel = (key: Rel | "auto") =>
    start(async () => {
      await setRelevance(nicheId, placeId, key);
      toast.success(key === "auto" ? "Handed back to the rules" : `Marked ${key}`);
    });

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1.5 text-sm font-medium">Relevance for this niche</div>
        <div className="inline-flex rounded-lg border p-0.5">
          {OPTIONS.map((o) => {
            const current = o.key === "auto" ? source !== "user" : relevance === o.key && source === "user";
            return (
              <button
                key={o.key}
                disabled={pending}
                onClick={() => setRel(o.key)}
                className={cn("rounded-md px-3 py-1 text-sm transition", current ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
              >
                {o.label}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Currently <b>{relevance ?? "undecided"}</b>
          {source && ` (${source === "user" ? "set by you" : source === "llm" ? "AI" : "rules"})`}
          {reason && `: ${reason}`}. Per niche: this does not change the business in other niches.
        </p>
      </div>

      <div>
        <Button
          variant={doNotContact ? "destructive" : "outline"}
          disabled={pending}
          onClick={() =>
            start(async () => {
              await setDoNotContact(placeId, !doNotContact);
              toast.success(doNotContact ? "Removed do-not-contact" : "Marked do-not-contact in every niche");
            })
          }
        >
          {pending ? <Loader2 className="animate-spin" /> : <Ban />} {doNotContact ? "Do not contact (click to undo)" : "Mark do-not-contact"}
        </Button>
        <p className="mt-1.5 text-xs text-muted-foreground">One flag per business, shared across niches.</p>
      </div>
    </div>
  );
}
