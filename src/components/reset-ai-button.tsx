"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, RotateCcw } from "lucide-react";
import { resetAiClassifications } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Undo every label the model gave in this niche, so Classify starts fresh. Renders nothing when there are none. */
export function ResetAiButton({ nicheId, aiLabelled }: { nicheId: number; aiLabelled: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (aiLabelled === 0) return null;

  async function run() {
    setBusy(true);
    try {
      const r = await resetAiClassifications(nicheId);
      toast.success(`Reset ${r.labels} AI labels`, { description: `${r.answers} saved answers cleared. Use Classify to judge them again.` });
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not reset");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} title="Undo the AI's labels so Classify can start fresh">
        <RotateCcw /> Reset {aiLabelled} AI labels
      </Button>
      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset the AI&apos;s labels?</DialogTitle>
            <DialogDescription>
              This undoes the {aiLabelled} labels the AI gave in this niche and clears its saved answers for them, so the next Classify asks the model again with everything now known about each business.
              Each business goes back to what the rules say. It costs nothing, and re-classifying them all costs about a cent.
              Anything you set by hand is kept, and so are labels the rules gave.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button variant="destructive" onClick={run} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <RotateCcw />} Reset {aiLabelled}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
