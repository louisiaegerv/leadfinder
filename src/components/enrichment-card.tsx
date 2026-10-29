import { ExternalLink, Mail, Phone, Search, UserRound } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Profile } from "@/lib/enrich";
import type { OwnerSearchRecord } from "@/lib/owner-search-db";
import type { SiteScan } from "@/lib/site-scan";
import type { ContactInfo } from "@/lib/site-scan-db";
import { cn } from "@/lib/utils";

const SOCIAL_LABEL: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  twitter: "X / Twitter",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  tiktok: "TikTok",
  yelp: "Yelp",
};

const NOTICE: Record<string, string> = {
  blank: "This site builds its pages with JavaScript, so the quick scan saw almost nothing. The paid website reader can render it.",
  blocked: "The site refused the quick scan (bot protection). The paid website reader may get through.",
  error: "The quick scan couldn't reach the site (timeout or connection error). Try again, or use the paid reader.",
  dead: "The site didn't load: the domain wasn't found or the page is gone. Worth a look by hand, since it may be down.",
  refused: "The site's address points somewhere private, so it was not fetched.",
  not_html: "The site's front page is a file, not a web page.",
};

const STALE_YEARS = 3;
type Chip = { text: string; gap: boolean };

/** Plain facts about the site, with the ones that point to something fixable flagged. */
function chips(scan: SiteScan): Chip[] {
  const s = scan.signals;
  const year = new Date().getFullYear();
  const out: Chip[] = [];
  if (!s.https) out.push({ text: "Not HTTPS", gap: true });
  if (!s.viewport) out.push({ text: "No mobile viewport tag", gap: true });
  if (s.hasBooking) out.push({ text: "Online booking", gap: false });
  else if (!s.hasForm) out.push({ text: "No contact or quote form", gap: true });
  else out.push({ text: "Has a contact form", gap: false });
  out.push(s.chat ? { text: `Chat: ${s.chat}`, gap: false } : { text: "No chat widget", gap: false });
  if (s.fbPixel) out.push({ text: "Facebook Pixel", gap: false });
  if (s.analytics) out.push({ text: "Analytics", gap: false });
  if (s.builder) out.push({ text: `Built on ${s.builder}`, gap: false });
  if (s.copyrightYear) out.push({ text: `© ${s.copyrightYear}`, gap: s.copyrightYear <= year - STALE_YEARS });
  return out;
}

const date = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/** What looking a business up turned up: from the quick site scan, a web search, the paid website reader, or all three. */
export function EnrichmentCard({
  site,
  search,
  scan,
  contact,
  ownerName,
  ownerIsGuess,
  actions,
}: {
  site: { profile: Profile; fetchedAt: Date } | null;
  search: { record: OwnerSearchRecord; fetchedAt: Date } | null;
  scan: { scan: SiteScan; fetchedAt: Date } | null;
  contact: ContactInfo;
  ownerName: string | null;
  ownerIsGuess: boolean;
  /** The scan and paid-reader buttons. */
  actions: React.ReactNode;
}) {
  const found = search?.record.finding ?? null;
  const s = scan?.scan;

  // People from the paid reader and from the site's structured data, once each.
  const people = [
    ...(site?.profile.people.map((p) => ({ name: p.name, title: p.title, email: p.email })) ?? []),
    ...(s?.people.map((p) => ({ name: p.name, title: `${p.role} (named in the site's structured data)`, email: null })) ?? []),
  ].filter((p, i, all) => all.findIndex((x) => x.name === p.name) === i);

  const online = Object.entries(contact.socials);
  const nothingYet = !site && !search && !scan;
  const sources = [search && `Web search ${date(search.fetchedAt)}`, scan && `Site scan ${date(scan.fetchedAt)}`, site && `Paid reader ${date(site.fetchedAt)}`].filter(Boolean);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle>Owner &amp; contact</CardTitle>
            <CardDescription>
              {nothingYet
                ? "Not looked up yet. “Find owner” at the top searches the web; the buttons here scan the website (free) or use the paid reader."
                : sources.join(" · ")}
            </CardDescription>
          </div>
          <div className="flex flex-wrap justify-end gap-2">{actions}</div>
        </div>
      </CardHeader>

      {!nothingYet && (
        <CardContent className="space-y-4 text-sm">
          {search && (
            <Section label="From web search">
              {found ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-x-2">
                    <Search className="size-3.5 text-muted-foreground" />
                    <span className="font-semibold">{found.name}</span>
                    <span className="text-muted-foreground">{found.title}</span>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs">
                      {found.hostsCount >= 2 ? `${found.hostsCount} sites agree` : "one source: unconfirmed"}
                    </span>
                    {found.linkedin && (
                      <a className="inline-flex items-center gap-1 text-blue-600 hover:underline dark:text-blue-400" href={found.linkedin} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="size-3" /> LinkedIn
                      </a>
                    )}
                  </div>
                  <ul className="space-y-1.5 border-l-2 pl-3">
                    {found.evidence.map((e) => (
                      <li key={e.url}>
                        <span className="text-muted-foreground">“{e.quote}”</span>{" "}
                        <a className="whitespace-nowrap text-blue-600 hover:underline dark:text-blue-400" href={e.url} target="_blank" rel="noopener noreferrer">
                          {host(e.url)}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-muted-foreground">
                  Searched, but no result clearly named the owner{search.record.snippetCount === 0 ? " (no results came back)" : ""}.
                </p>
              )}
            </Section>
          )}

          {s && (
            <Section label="Website">
              {s.outcome === "ok" ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {chips(s).map((c) => (
                      <span
                        key={c.text}
                        className={cn("rounded-full px-2 py-0.5 text-xs", c.gap ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200" : "bg-muted text-muted-foreground")}
                      >
                        {c.text}
                      </span>
                    ))}
                  </div>
                  {(s.aboutUrl || s.contactUrl) && (
                    <div className="flex flex-wrap gap-3 text-xs">
                      {s.aboutUrl && (
                        <a className="inline-flex items-center gap-1 text-blue-600 hover:underline dark:text-blue-400" href={s.aboutUrl} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="size-3" /> About page
                        </a>
                      )}
                      {s.contactUrl && (
                        <a className="inline-flex items-center gap-1 text-blue-600 hover:underline dark:text-blue-400" href={s.contactUrl} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="size-3" /> Contact page
                        </a>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground">{NOTICE[s.outcome] ?? "The quick scan could not read this site."}</p>
              )}
            </Section>
          )}

          {site && people.length === 0 && contact.emails.length === 0 && contact.phones.length === 0 && (
            <p className="text-muted-foreground">The paid reader found no names, emails or phone numbers on the website.</p>
          )}

          {people.length > 0 && (
            <Section label="People">
              <ul className="space-y-1">
                {people.map((person) => (
                  <li key={person.name} className="flex flex-wrap items-center gap-x-2">
                    <UserRound className="size-3.5 text-muted-foreground" />
                    <span className={person.name === ownerName ? "font-semibold" : "font-medium"}>{person.name}</span>
                    {person.title && <span className="text-muted-foreground">{person.title}</span>}
                    {person.name === ownerName && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{ownerIsGuess ? "likely owner (only person listed)" : "owner"}</span>
                    )}
                    {person.email && (
                      <a className="inline-flex items-center gap-1 text-blue-600 hover:underline dark:text-blue-400" href={`mailto:${person.email}`}>
                        <Mail className="size-3" /> {person.email}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
              {!people.some((x) => x.name === ownerName) && people.length > 1 && (
                <p className="mt-1 text-xs text-muted-foreground">No one is labelled owner on the site, so none is picked for you.</p>
              )}
            </Section>
          )}

          {contact.emails.length > 0 && (
            <Section label="Emails">
              <div className="flex flex-wrap gap-1.5">
                {contact.emails.map((e) => (
                  <a key={e} href={`mailto:${e}`} className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 hover:bg-muted">
                    <Mail className="size-3" /> {e}
                  </a>
                ))}
              </div>
            </Section>
          )}

          {contact.phones.length > 0 && (
            <Section label="Phones">
              <div className="flex flex-wrap gap-1.5">
                {contact.phones.map((ph) => (
                  <a key={ph} href={`tel:${ph}`} className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 hover:bg-muted">
                    <Phone className="size-3" /> {ph}
                  </a>
                ))}
              </div>
            </Section>
          )}

          {online.length > 0 && (
            <Section label="Online">
              <div className="flex flex-wrap gap-1.5">
                {online.map(([k, url]) => (
                  <a key={k} href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 hover:bg-muted">
                    <ExternalLink className="size-3" /> {SOCIAL_LABEL[k] ?? k}
                  </a>
                ))}
              </div>
            </Section>
          )}

          {site && (site.profile.services || site.profile.serviceArea || site.profile.yearEstablished) && (
            <Section label="About the business">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                {site.profile.yearEstablished && (<><dt className="text-muted-foreground">Established</dt><dd>{site.profile.yearEstablished}</dd></>)}
                {site.profile.serviceArea && (<><dt className="text-muted-foreground">Service area</dt><dd>{site.profile.serviceArea}</dd></>)}
                {site.profile.services && (<><dt className="text-muted-foreground">Services</dt><dd className="line-clamp-4">{site.profile.services}</dd></>)}
              </dl>
            </Section>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}
