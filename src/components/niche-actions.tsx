"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteNiche, duplicateNiche } from "@/app/actions";

export function NicheActions({ id, name }: { id: number; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="flex gap-2">
      <Button
        variant="outline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const { id: newId } = await duplicateNiche(id);
            toast.success("Niche duplicated (settings and areas; no runs)");
            router.push(`/niches/${newId}`);
          })
        }
      >
        <Copy /> Duplicate
      </Button>
      <Button
        variant="destructive"
        disabled={pending}
        onClick={() => {
          if (!confirm(`Delete niche "${name}", its areas and runs? Scraped places stay in the global store.`)) return;
          start(async () => {
            await deleteNiche(id);
            toast.success("Niche deleted");
            router.push("/");
          });
        }}
      >
        <Trash2 /> Delete
      </Button>
    </div>
  );
}
