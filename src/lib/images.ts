/** Street View is returned when a business has no photos of its own, and it 403s outside a browser session. */
export const isStreetView = (url: string | null | undefined) =>
  !!url && url.includes("streetviewpixels");

/**
 * Pick something small and displayable. Google's full-size photo URLs can be
 * multi-megapixel, so lh*.googleusercontent.com photos get a size suffix
 * (checked: ~77 KB -> ~7 KB). Returns null when there is nothing worth showing.
 */
export function thumbSrc(
  p: { imageUrl?: string | null; thumbnailUrl?: string | null },
  size = 128,
): string | null {
  const url = [p.thumbnailUrl, p.imageUrl].find((u) => u && !isStreetView(u));
  if (!url) return null;
  const isGoogleHosted = /^https:\/\/lh\d\.googleusercontent\.com\//.test(url);
  // Already sized (=w86-h114-k-no) or a /s80-style logo path: leave alone.
  if (isGoogleHosted && !/=[wsh]\d/.test(url) && !/\/s\d+-/.test(url)) {
    return `${url}=w${size}-h${size}-c`;
  }
  return url;
}

export function initials(title: string): string {
  const words = title.replace(/[^\p{L}\p{N} ]/gu, "").trim().split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? "?") + (words[1]?.[0] ?? "")).toUpperCase();
}

/** Stable pastel-ish hue per business so fallback tiles are not all the same grey. */
export function hueFor(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 360;
  return h;
}
