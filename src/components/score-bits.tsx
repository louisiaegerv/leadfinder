import { OFFER_LABEL, type OfferKey } from "@/lib/offers";
import { OFFER_STYLE, TIER_STYLE } from "@/lib/offer-ui";
import { tierOf } from "@/lib/scoring";
import { cn } from "@/lib/utils";

export function ScoreBadge({ score, className }: { score: number | null; className?: string }) {
  const tier = tierOf(score);
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)} title={`Tier ${tier}`}>
      <span className={cn("inline-flex size-6 items-center justify-center rounded-md text-xs font-bold", TIER_STYLE[tier])}>{tier}</span>
      <span className="text-sm font-semibold tabular-nums">{score ?? "–"}</span>
    </span>
  );
}

export function OfferChip({ offer, muted, className }: { offer: OfferKey | null; muted?: boolean; className?: string }) {
  if (!offer) return <span className="text-xs text-muted-foreground">no clear lead</span>;
  return (
    <span className={cn("inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", OFFER_STYLE[offer].chip, muted && "opacity-60", className)}>
      {OFFER_LABEL[offer]}
    </span>
  );
}
