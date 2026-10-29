"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Check, Loader2 } from "lucide-react";
import { dismissFollowUp } from "@/app/actions";
import { Button } from "@/components/ui/button";

/** Drops the follow-up without logging a call (e.g. you handled it another way). */
export function FollowUpDone({ logId }: { logId: number }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      title="Remove this follow-up"
      onClick={() => start(async () => { await dismissFollowUp(logId); toast.success("Follow-up cleared"); })}
    >
      {pending ? <Loader2 className="animate-spin" /> : <Check />} Done
    </Button>
  );
}
