"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { ChevronRight, Loader2, Phone, SkipForward, X } from "lucide-react";
import { nextLeadUrl, skipLead } from "@/app/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { KIND_LABEL, type QueueKind } from "@/lib/call-queue";

/** Sits above the tab bar while you work the queue: where you are, skip, and a one-tap call. */
export function QueueBar({
  nicheId,
  placeId,
  title,
  phone,
  kind,
  left,
  adjacent,
}: {
  nicheId: number;
  placeId: string;
  title: string;
  phone: string | null;
  /** What this business is in the queue, or null when it is not in it (already called, or skipped). */
  kind: QueueKind | null;
  /** How many others are still waiting. */
  left: number;
  adjacent: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const go = (url: string | null) => {
    if (url) router.push(url);
    else {
      toast.success("That's the whole queue for now");
      router.push("/outreach");
    }
  };

  return (
    <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 border-t bg-background/95 backdrop-blur md:bottom-0 md:left-64">
      <div className="mx-auto flex max-w-5xl items-center gap-2 px-3 py-2">
        <div className="min-w-0 flex-1 text-xs leading-tight">
          <div className="truncate font-medium" title={title}>{title}</div>
          <div className="truncate text-muted-foreground">
            {kind ? KIND_LABEL[kind] : "Not in the queue"} · {left === 0 ? "none waiting after" : `${left} waiting after`}
          </div>
        </div>
        {kind ? (
          <Button variant="outline" disabled={pending} onClick={() => start(async () => go(await skipLead(nicheId, placeId, adjacent)))} title="Hide this one for today and open the next">
            {pending ? <Loader2 className="animate-spin" /> : <SkipForward />} Skip
          </Button>
        ) : (
          <Button variant="outline" disabled={pending} onClick={() => start(async () => go(await nextLeadUrl(nicheId, placeId, adjacent)))}>
            {pending ? <Loader2 className="animate-spin" /> : <ChevronRight />} Next lead
          </Button>
        )}
        {phone && (
          <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} title={`Call ${phone}`} className={buttonVariants()}>
            <Phone /> Call
          </a>
        )}
        <Link href="/outreach" aria-label="Leave the queue" title="Leave the queue" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
          <X className="size-4" />
        </Link>
      </div>
    </div>
  );
}
