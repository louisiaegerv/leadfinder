import { ExternalLink, Megaphone } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { adLibraryUrl, type FacebookSearchRecord } from "@/lib/facebook-search";
import type { FacebookState } from "@/lib/offers";

const STATE_LABEL: Record<FacebookState, string> = {
  no_page: "No Facebook page found",
  page_no_ads: "Facebook page, no active ads",
  active_ads: "Running Facebook ads",
  active_ads_weak_landing: "Running ads to a weak landing page",
};

const SOURCE_LABEL: Record<string, string> = {
  maps_website: "linked from their own website",
  search: "found by Google search",
  user: "set by you",
};

const link = "text-blue-600 hover:underline dark:text-blue-400";
const confidenceLabel = (c: number) => (c >= 0.8 ? "high" : "medium");

/** The business's Facebook page: where it came from and why it was picked, ready for the Meta Ad Library check. */
export function FacebookCard({
  fb,
  search,
  country,
  action,
}: {
  fb: { pageUrl: string | null; pageId: string | null; matchSource: string | null; matchConfidence: number | null; state: FacebookState | null } | null;
  search: { record: FacebookSearchRecord; fetchedAt: Date } | null;
  country: string;
  /** The "Find Facebook page" button. */
  action: React.ReactNode;
}) {
  const best = search?.record.best ?? null;
  // A candidate is only worth listing as "possible" when it wasn't the page we saved.
  const possible = (search?.record.candidates ?? []).filter((c) => !c.accepted && c.url !== fb?.pageUrl);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle>Facebook</CardTitle>
            {fb?.state && <CardDescription>{STATE_LABEL[fb.state]}</CardDescription>}
          </div>
          {action}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {fb?.pageUrl ? (
          <div className="space-y-1.5">
            <a className={link} href={fb.pageUrl} target="_blank" rel="noopener noreferrer">{fb.pageUrl}</a>
            <p className="text-xs text-muted-foreground">
              {SOURCE_LABEL[fb.matchSource ?? ""] ?? "found"}
              {fb.matchSource === "search" && fb.matchConfidence != null && ` · ${confidenceLabel(fb.matchConfidence)} confidence`}
            </p>
            {fb.matchSource === "search" && best?.url === fb.pageUrl && (
              <p className="border-l-2 pl-3 text-xs text-muted-foreground">
                Google result: “{best.title}”{best.description ? ` · ${best.description.slice(0, 140)}` : ""}
              </p>
            )}
            {fb.pageId ? (
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-muted-foreground">Page ID <span className="font-mono text-foreground">{fb.pageId}</span></span>
                <a className={`inline-flex items-center gap-1 ${link}`} href={adLibraryUrl(fb.pageId, country)} target="_blank" rel="noopener noreferrer">
                  <Megaphone className="size-3" /> Check ads in the Ad Library <ExternalLink className="size-3" />
                </a>
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">The link has no page ID (a custom address), which the Ad Library lookup needs.</p>
            )}
          </div>
        ) : search ? (
          <p className="text-muted-foreground">
            Searched Google{search.record.snippetCount === 0 ? " (no results came back)" : ""}, but nothing clearly their own page. That doesn&apos;t prove they have none.
          </p>
        ) : (
          <p className="text-muted-foreground">No Facebook page known yet. “Find Facebook page” searches Google for it, and the site scan picks up one linked from their website.</p>
        )}

        {possible.length > 0 && (
          <div>
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Possible, not confirmed</div>
            <ul className="space-y-1">
              {possible.map((c) => (
                <li key={c.url}>
                  <a className={link} href={c.url} target="_blank" rel="noopener noreferrer">{c.url.replace("https://www.", "")}</a>
                  <span className="text-xs text-muted-foreground"> · “{c.title}”</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!fb?.state && (
          <p className="text-xs text-muted-foreground">
            Whether this page runs ads is not checked yet: that is the Ad Library step. Until then the Facebook-ads fit is estimated from trade, reviews and site signals.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
