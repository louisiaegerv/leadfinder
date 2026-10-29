import { MessageSquareReply, Star } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ageLabel, reviewStats, type ReviewSample } from "@/lib/reviews";
import { cn } from "@/lib/utils";

const DAY = 86_400_000;

/** The newest few reviews, when a run asked for them: how recent they are, and whether the owner answers. */
export function RecentReviews({ sample, sampledAt, action }: { sample: ReviewSample[] | null; sampledAt: Date | null; action?: React.ReactNode }) {
  const now = new Date();
  const stats = reviewStats(sample, now);

  if (sample === null) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1.5">
              <CardTitle>Recent reviews</CardTitle>
              <CardDescription>
                Not collected yet. Fetch just this business&apos;s newest reviews with the button (about $0.002), or turn on “Include the newest reviews” in the area&apos;s run setup.
              </CardDescription>
            </div>
            {action}
          </div>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle>Recent reviews</CardTitle>
            <CardDescription>
              {stats ? (
                <>
                  Newest review <b className="text-foreground">{ageLabel(stats.newestDays)}</b> ago
                  {stats.perMonth != null && <> · about {stats.perMonth} a month while they were coming in</>}
                  {stats.count >= 3 && <> · replied to {stats.replied} of {stats.count}</>}
                  {sampledAt && <> · collected {sampledAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</>}
                </>
              ) : (
                "No reviews on Google."
              )}
            </CardDescription>
          </div>
          {action}
        </div>
      </CardHeader>
      {sample.length > 0 && (
        <CardContent>
          <ul className="space-y-3 text-sm">
            {sample.map((r) => {
              const days = Math.max(0, Math.floor((now.getTime() - Date.parse(r.at)) / DAY));
              return (
                <li key={r.id} className="flex gap-3">
                  <span className={cn("mt-0.5 inline-flex h-5 shrink-0 items-center gap-0.5 rounded px-1.5 text-xs font-semibold", (r.stars ?? 5) <= 2 ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200" : "bg-muted")}>
                    {r.stars ?? "–"} <Star className="size-3 fill-current" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      <span>{ageLabel(days)} ago</span>
                      {r.replied && (
                        <span className="inline-flex items-center gap-1">
                          <MessageSquareReply className="size-3" /> owner replied
                        </span>
                      )}
                    </div>
                    <p className={cn("line-clamp-3", !r.text && "text-muted-foreground")}>{r.text ?? "(rating only, no text)"}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      )}
    </Card>
  );
}
