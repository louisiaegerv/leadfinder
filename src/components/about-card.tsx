import { Globe } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { SiteScan } from "@/lib/site-scan";

const date = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** What the business's own website says about itself, as read by the site scan. This is the text the AI sees when it judges relevance. */
export function AboutCard({ scan, hasWebsite }: { scan: { scan: SiteScan; fetchedAt: Date } | null; hasWebsite: boolean }) {
  const s = scan?.scan;
  const text = s && (s.description || s.heading || s.services || s.about) ? { description: s.description, heading: s.heading, services: s.services, about: s.about } : null;

  let empty: string | null = null;
  if (!text) {
    if (!hasWebsite) empty = "No business website to read, so there is nothing to describe them beyond their Google listing.";
    else if (!s) empty = "Not read yet. “Scan website” below reads it for free.";
    else if (s.services === undefined) empty = "This site was scanned before descriptions were read. “Scan again” below picks it up.";
    else if (s.outcome !== "ok") empty = "The scan could not read this site, so there is no text from it.";
    else empty = "The site has no description or readable copy.";
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Globe className="size-4" /> About the business</CardTitle>
        <CardDescription>{text && scan ? `From their website, scanned ${date(scan.fetchedAt)}. The AI reads this when it decides whether they fit the niche.` : "From their website."}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {text ? (
          <>
            {text.heading && <p className="font-medium">{text.heading}</p>}
            {text.description && <p>{text.description}</p>}
            {text.about && <p className="text-muted-foreground">{text.about}</p>}
            {text.services && <p className="text-xs text-muted-foreground"><span className="font-medium">Headings and menu:</span> {text.services}</p>}
          </>
        ) : (
          <p className="text-muted-foreground">{empty}</p>
        )}
      </CardContent>
    </Card>
  );
}
