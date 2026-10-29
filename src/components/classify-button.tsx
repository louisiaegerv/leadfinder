"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function ClassifyButton({ nicheId, gray }: { nicheId: number; gray: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<{ model: string; defaultLimit: number } | null>(null);

  if (gray === 0) return null;

  async function openDialog() {
    setOpen(true);
    try {
      setInfo(await (await fetch(`/api/niches/${nicheId}/classify`)).json());
    } catch {
      /* the dialog still works without the model name */
    }
  }

  async function run() {
    setBusy(true);
    try {
      const res = await fetch(`/api/niches/${nicheId}/classify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: info?.defaultLimit ?? 100 }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Classification failed");
      if (d.error) toast.error("Stopped early", { description: d.error });
      else
        toast.success(`Classified ${d.classified} businesses`, {
          description: `${d.fromCache} from cache, ${d.remaining} still undecided${d.costUsd ? `, ~$${d.costUsd.toFixed(4)}` : ""}`,
        });
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Classification failed");
    } finally {
      setBusy(false);
    }
  }

  const n = Math.min(gray, info?.defaultLimit ?? 100);

  return (
    <>
      <Button variant="outline" onClick={openDialog}>
        <Sparkles /> Review {gray} undecided with AI
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Classify undecided businesses?</DialogTitle>
            <DialogDescription>
              The rules could not decide these {gray}. This sends up to {n} (name, categories, domain) to {info?.model ?? "the model"} on OpenRouter and
              labels each target, adjacent or noise with a reason. Results are cached, and anything you set by hand is never overwritten.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={run} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Sparkles />} Classify {n}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
