import { websiteKind } from "./scoring";

/** Pay-per-result: $0.015 per business, plus a tiny start fee (4 GB x $0.00005). Failed URLs and thin results aren't charged. */
export const ENRICH_PRICE_USD = 0.015;
const ENRICH_START_USD = 0.0002;
/** Most businesses one click will send, so a mistaken bulk run stays cheap. */
export const MAX_PER_RUN = 300;

export const estimateEnrichCostUsd = (n: number) => (n > 0 ? n * ENRICH_PRICE_USD + ENRICH_START_USD : 0);

/** Hard spend limit for a run: the estimate plus a cent of slack, never above the global cap. */
export const enrichCapUsd = (n: number, globalCap: number) => Math.min(globalCap, estimateEnrichCostUsd(n) + 0.01);

/** How many businesses fit under a spend cap. */
export const maxBusinessesForCap = (cap: number) => Math.max(0, Math.floor((cap - 0.0102) / ENRICH_PRICE_USD));

/**
 * The website to send to the enricher, or null when there is nothing worth reading:
 * no website, or only a social/directory page (the owner isn't on a Facebook page's "about").
 * Always the site's front page: Maps often stores a deep landing page with tracking parameters,
 * but the About, Contact and Team pages the actor looks for hang off the front page.
 */
export function enrichableUrl(p: { website: string | null; domain: string | null }): string | null {
  const kind = websiteKind(p.domain, p.website);
  if (kind !== "own" && kind !== "builder") return null;
  const raw = p.website?.trim() || (p.domain ? `https://${p.domain}` : "");
  if (!raw) return null;
  try {
    return `${new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).origin}/`;
  } catch {
    return null;
  }
}

/** Lowercase host without "www.", so results can be matched back whatever the URL looks like. */
export function hostOf(url: string): string | null {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase().replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

// ---------- reading the actor's output ----------

export type Person = { name: string; title: string | null; email: string | null };

export type Profile = {
  url: string | null;
  people: Person[];
  emails: string[];
  phones: string[];
  socials: Partial<Record<"facebook" | "instagram" | "twitter" | "linkedin" | "youtube" | "tiktok" | "yelp", string>>;
  description: string | null;
  services: string | null;
  serviceArea: string | null;
  yearEstablished: number | null;
  confidence: number | null;
  fieldsFound: number | null;
};

const text = (v: unknown): string | null => {
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return v.map(text).filter(Boolean).join(", ") || null;
  return null;
};

/** The actor returns emails/phones as one comma-separated string, but accept an array too. */
function list(v: unknown, split: RegExp): string[] {
  const parts = Array.isArray(v) ? v.flatMap((x) => (typeof x === "string" ? x.split(split) : [])) : typeof v === "string" ? v.split(split) : [];
  return [...new Set(parts.map((s) => s.trim()).filter(Boolean))];
}

const CONFIDENCE: Record<string, number> = { high: 0.9, medium: 0.6, low: 0.3 };

const SOCIALS = ["facebook", "instagram", "twitter", "linkedin", "youtube", "tiktok", "yelp"] as const;

export function parseItem(item: Record<string, unknown>): Profile {
  const people: Person[] = (Array.isArray(item.people) ? item.people : []).flatMap((p) => {
    if (!p || typeof p !== "object") return [];
    const o = p as Record<string, unknown>;
    const name = text(o.name);
    return name ? [{ name, title: text(o.title) ?? text(o.role), email: text(o.linked_email) }] : [];
  });

  const socials: Profile["socials"] = {};
  for (const k of SOCIALS) {
    const v = text(item[k]);
    if (v && /^https?:\/\//i.test(v)) socials[k] = v;
  }

  const c = item.confidence;
  const confidence = typeof c === "number" ? Math.max(0, Math.min(1, c)) : typeof c === "string" ? (CONFIDENCE[c.toLowerCase()] ?? null) : null;
  const year = Number(item.yearEstablished);

  return {
    url: text(item.url),
    people,
    emails: list(item.emails, /[,;\s]+/).filter((e) => e.includes("@")),
    phones: list(item.phones, /[,;\n]+/),
    socials,
    description: text(item.description),
    services: text(item.services),
    serviceArea: text(item.serviceArea),
    yearEstablished: Number.isInteger(year) && year > 1800 ? year : null,
    confidence,
    fieldsFound: typeof item.fieldsFound === "number" ? item.fieldsFound : null,
  };
}

// "Vice President" and "Assistant President" are not the owner; "operator" alone is a job, not ownership ("Equipment Operator").
export const OWNERISH = /\b(owner|co-?owner|founder|co-?founder|(?<!vice[ -])(?<!assistant )president|proprietor|principal|ceo|chief executive|managing (partner|member|director))\b/i;

/**
 * Who to ask for. A person whose title says owner/founder/president is a safe pick. A sole
 * listed person with no such title is probably the owner, so it is used but flagged as a guess.
 * With several people and no clear owner we don't guess: the list is still shown.
 */
export function pickOwner(people: Person[]): { name: string; title: string | null; certain: boolean } | null {
  const clear = people.find((p) => p.title && OWNERISH.test(p.title));
  if (clear) return { name: clear.name, title: clear.title, certain: true };
  if (people.length === 1) return { name: people[0].name, title: people[0].title, certain: false };
  return null;
}

/** Which targets does a result row belong to? Matched by website host, since failed URLs have no row. */
export function matchTargets<T extends { url: string }>(item: Record<string, unknown>, targets: T[]): T[] {
  const host = typeof item.url === "string" ? hostOf(item.url) : null;
  return host ? targets.filter((t) => hostOf(t.url) === host) : [];
}
