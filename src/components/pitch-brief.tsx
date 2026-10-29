import { CopyButton } from "@/components/copy-button";
import { OfferChip } from "@/components/score-bits";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OFFER_LABEL } from "@/lib/offers";
import { briefToText, type Brief } from "@/lib/pitch";
import { cn } from "@/lib/utils";

/** What to say on the call, built from this business's own numbers and its lead offer. */
export function PitchBrief({ brief, title }: { brief: Brief | null; title: string }) {
  if (!brief) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Pitch brief</CardTitle>
          <CardDescription>No clear lead offer for this business yet, so there is nothing to build a pitch around.</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle>Pitch brief</CardTitle>
            <CardDescription className="flex items-center gap-2">
              Lead with <OfferChip offer={brief.offer} />
            </CardDescription>
          </div>
          <CopyButton text={briefToText(brief, title)} label="Copy brief" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <Block label="Opener">{brief.hook}</Block>
        <Block label="Then ask">{brief.question}</Block>

        {brief.facts.length > 0 && (
          <Block label="What we noticed">
            <ul className="list-disc space-y-0.5 pl-4">
              {brief.facts.map((f, i) => (
                <li key={i} className={cn(f.startsWith("(inferred)") && "italic text-amber-700 dark:text-amber-400")}>{f}</li>
              ))}
            </ul>
          </Block>
        )}

        <Block label="If they say">
          <div className="space-y-2">
            {brief.objections.map((o) => (
              <div key={o.they}>
                <div className="font-medium">“{o.they}”</div>
                <div className="text-muted-foreground">{o.reply}</div>
              </div>
            ))}
          </div>
        </Block>

        <Block label="Close">{brief.ask}</Block>

        {brief.fallback && (
          <Block label={`If it doesn't land, pivot to ${OFFER_LABEL[brief.fallback.offer]}`}>{brief.fallback.hook}</Block>
        )}
      </CardContent>
    </Card>
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div>{children}</div>
    </div>
  );
}
