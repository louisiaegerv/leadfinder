"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Tag } from "lucide-react";
import { tagResults } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MAX_TAG } from "@/lib/tags";

/** Tag every business the table currently matches (all pages), or take a tag back off them. */
export function TagResultsButton({
  nicheId,
  total,
  params,
  existing,
}: {
  nicheId: number;
  total: number;
  /** The table's filters, exactly as they are in the URL. */
  params: Record<string, string>;
  existing: { tag: string; n: number }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tag, setTag] = useState("");
  const [mode, setMode] = useState<"add" | "remove">("add");

  const count = `${total.toLocaleString()} business${total === 1 ? "" : "es"}`;

  async function run() {
    setBusy(true);
    try {
      const r = await tagResults(nicheId, params, tag, mode);
      toast.success(mode === "add" ? `Tagged ${r.changed} with “${r.tag}”` : `Removed “${r.tag}” from ${r.changed}`, {
        description:
          r.changed === r.matched
            ? undefined
            : `${r.matched - r.changed} of ${r.matched} ${mode === "add" ? "already had it" : "did not have it"}.`,
      });
      setOpen(false);
      setTag("");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update the tags");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} disabled={total === 0} title="Tag every business matching the current filters">
        <Tag /> Tag results
      </Button>
      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{mode === "add" ? "Tag" : "Untag"} these {count}?</DialogTitle>
            <DialogDescription>
              This applies to everything the table matches for the current filters, on every page, not only the 50 on screen. Tags show in the table, can be filtered on, and are a column in every export.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (tag.trim() && !busy) void run();
            }}
          >
            <div className="flex gap-1 rounded-lg border p-1 text-sm">
              {(["add", "remove"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`flex-1 rounded-md px-3 py-1 ${mode === m ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {m === "add" ? "Add tag" : "Remove tag"}
                </button>
              ))}
            </div>
            <Input list="existing-tags" value={tag} onChange={(e) => setTag(e.target.value)} maxLength={MAX_TAG} placeholder="e.g. call-monday, batch-1" autoFocus />
            <datalist id="existing-tags">
              {existing.map((t) => (
                <option key={t.tag} value={t.tag} />
              ))}
            </datalist>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={run} disabled={busy || !tag.trim()}>
              {busy ? <Loader2 className="animate-spin" /> : <Tag />} {mode === "add" ? "Tag" : "Untag"} {total.toLocaleString()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
