import { normalizeDomain } from "./normalize";

export const MAX_WEBSITE = 500;

export type ManualWebsite = { website: string; domain: string };

/**
 * A website typed in by hand. It may be pasted without "https://"; anything else that is not a web address is refused.
 * Empty means "none". Throws a message fit to show when what was typed is not a website.
 */
export function parseManualWebsite(input: string | null | undefined): ManualWebsite | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;
  if (raw.length > MAX_WEBSITE) throw new Error(`Keep the link under ${MAX_WEBSITE} characters`);
  const bad = new Error("That does not look like a website address");
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) && !/^https?:\/\//i.test(raw)) throw bad;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw bad;
  }
  // A real host has a dotted name ending in letters; this keeps out "localhost", IP addresses and stray words.
  if (url.username || url.password || !/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z][a-z0-9-]+$/i.test(url.hostname)) throw bad;
  url.hash = "";
  const domain = normalizeDomain(null, url.href);
  if (!domain) throw bad;
  return { website: url.href, domain };
}
