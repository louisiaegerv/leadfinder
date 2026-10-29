/** Normalize one Apify Google Maps item into the fields we keep. */
import { readReviews, type ReviewSample } from "./reviews";

export type NormalizedPlace = {
  placeId: string;
  cid: string | null;
  title: string;
  categories: string[];
  address: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  countryCode: string | null;
  phone: string | null;
  website: string | null;
  domain: string | null;
  totalScore: number | null;
  reviewsCount: number | null;
  permanentlyClosed: boolean | null;
  temporarilyClosed: boolean | null;
  lat: number | null;
  lng: number | null;
  openingHours: Record<string, string> | null;
  bookingLinks: string[] | null;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  logoUrl: string | null;
  photosCount: number | null;
  /** The newest reviews if the run asked for them; null when it did not, so older data is never wiped. */
  reviewSample: ReviewSample[] | null;
};

export type Provenance = {
  query: string;
  searchGridIndex: number | null;
  searchLat: number | null;
  searchLng: number | null;
};

type Raw = Record<string, unknown>;

const str = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const bool = (v: unknown): boolean | null =>
  typeof v === "boolean" ? v : v === "true" ? true : v === "false" ? false : null;

export function normalizeDomain(domain: unknown, website: unknown): string | null {
  let d = str(domain);
  if (!d) {
    const w = str(website);
    if (!w) return null;
    try {
      d = new URL(w.includes("://") ? w : `https://${w}`).hostname;
    } catch {
      return null;
    }
  }
  return d.toLowerCase().replace(/^www\./, "");
}

/** Accept categories as an array or as flattened `categories/0..n` columns. */
function readCategories(raw: Raw): string[] {
  const list = Array.isArray(raw.categories) ? raw.categories.map(str) : [];
  if (list.length === 0) {
    for (let i = 0; i < 30; i++) list.push(str(raw[`categories/${i}`]));
  }
  const out = list.filter((c): c is string => !!c);
  if (out.length === 0) {
    const one = str(raw.categoryName);
    if (one) out.push(one);
  }
  return out;
}

/** Only present when the actor returned a gallery; never requested (it is a paid add-on). */
function firstGalleryThumb(raw: Raw): string | null {
  const first = Array.isArray(raw.images) ? (raw.images[0] as Raw | undefined) : undefined;
  return str(first?.thumbnailUrl ?? raw["images/0/thumbnailUrl"]);
}

const obj = (v: unknown): Raw | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : null;

export function normalizeItem(raw: Raw): { place: NormalizedPlace; prov: Provenance } | null {
  const cid = str(raw.cid);
  const placeId = str(raw.placeId) ?? (cid ? `cid:${cid}` : null);
  const title = str(raw.title);
  if (!placeId || !title) return null;

  const loc = obj(raw.location);
  const sc = obj(raw.searchCenter);
  const hours = obj(raw.openingHours);

  return {
    place: {
      placeId,
      cid,
      title,
      categories: readCategories(raw),
      address: str(raw.address),
      street: str(raw.street),
      city: str(raw.city),
      state: str(raw.state),
      postalCode: str(raw.postalCode),
      countryCode: str(raw.countryCode),
      phone: str(raw.phoneUnformatted) ?? str(raw.phone),
      website: str(raw.website),
      domain: normalizeDomain(raw.domain, raw.website),
      totalScore: num(raw.totalScore ?? raw.rating),
      reviewsCount: num(raw.reviewsCount ?? raw.ratingCount),
      permanentlyClosed: bool(raw.permanentlyClosed),
      temporarilyClosed: bool(raw.temporarilyClosed),
      lat: num(loc?.lat ?? raw.latitude),
      lng: num(loc?.lng ?? raw.longitude),
      openingHours: hours
        ? Object.fromEntries(Object.entries(hours).map(([k, v]) => [k, String(v)]))
        : null,
      bookingLinks: Array.isArray(raw.bookingLinks)
        ? raw.bookingLinks.map(str).filter((x): x is string => !!x)
        : null,
      imageUrl: str(raw.imageUrl),
      thumbnailUrl: str(raw.thumbnailUrl) ?? firstGalleryThumb(raw),
      logoUrl: str(raw.logoUrl),
      photosCount: num(raw.imagesCount),
      reviewSample: readReviews(raw.reviews),
    },
    prov: {
      query: str(raw.query) ?? str(raw.searchString) ?? "",
      searchGridIndex: num(raw.searchGridIndex),
      searchLat: num(sc?.lat ?? raw["searchCenter/lat"]),
      searchLng: num(sc?.lng ?? raw["searchCenter/lng"]),
    },
  };
}

/**
 * JSON.parse turns a 19-digit cid into a lossy double. Quote bare numeric
 * cid values in the raw text first so they survive as exact strings.
 */
export function parseDatasetJson(text: string): Raw[] {
  const safe = text.replace(/("cid"\s*:\s*)(\d{15,})/g, '$1"$2"');
  return JSON.parse(safe) as Raw[];
}
