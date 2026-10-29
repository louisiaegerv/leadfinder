export type LatLng = { lat: number; lng: number };

export type Shape =
  | { shape: "radius"; centerLat: number; centerLng: number; radiusKm: number }
  | { shape: "polygon"; polygon: [number, number][] }; // [lat, lng]

const EARTH_KM = 6371.0088;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Ray casting. Polygon vertices are [lat, lng]. */
export function pointInPolygon(p: LatLng, polygon: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [yi, xi] = polygon[i];
    const [yj, xj] = polygon[j];
    const crosses =
      yi > p.lat !== yj > p.lat && p.lng < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

export function inShape(p: LatLng, s: Shape): boolean {
  return s.shape === "radius"
    ? haversineKm(p, { lat: s.centerLat, lng: s.centerLng }) <= s.radiusKm
    : pointInPolygon(p, s.polygon);
}

export type BBox = { south: number; west: number; north: number; east: number };

export function boundingBox(s: Shape): BBox {
  if (s.shape === "radius") {
    const dLat = s.radiusKm / 110.574;
    const dLng = s.radiusKm / (111.32 * Math.cos(rad(s.centerLat)));
    return {
      south: s.centerLat - dLat,
      north: s.centerLat + dLat,
      west: s.centerLng - dLng,
      east: s.centerLng + dLng,
    };
  }
  const lats = s.polygon.map((p) => p[0]);
  const lngs = s.polygon.map((p) => p[1]);
  return {
    south: Math.min(...lats),
    north: Math.max(...lats),
    west: Math.min(...lngs),
    east: Math.max(...lngs),
  };
}

export function shapeCenter(s: Shape): LatLng {
  if (s.shape === "radius") return { lat: s.centerLat, lng: s.centerLng };
  const b = boundingBox(s);
  return { lat: (b.south + b.north) / 2, lng: (b.west + b.east) / 2 };
}

/**
 * Search grid, an estimate of what the actor does (matched one real run):
 * start at the bounding box's SW corner, step lat by km/110.574 and lng by
 * km/(111.32*cos(mid-lat)), keep points inside the shape, centre point first.
 * Points are computed as corner + i*step (not accumulated) to avoid drift.
 */
export function gridPoints(s: Shape, spacingKm: number, maxPoints = 5000): LatLng[] {
  if (!(spacingKm > 0)) return [];
  const box = boundingBox(s);
  const midLat = (box.south + box.north) / 2;
  const stepLat = spacingKm / 110.574;
  const stepLng = spacingKm / (111.32 * Math.cos(rad(midLat)));
  const eps = 1e-9;

  const centre = shapeCenter(s);
  const out: LatLng[] = [];
  if (inShape(centre, s)) out.push(centre);

  for (let i = 0; box.south + i * stepLat <= box.north + eps; i++) {
    const lat = box.south + i * stepLat;
    for (let j = 0; box.west + j * stepLng <= box.east + eps; j++) {
      const p = { lat, lng: box.west + j * stepLng };
      if (!inShape(p, s)) continue;
      if (Math.abs(p.lat - centre.lat) < 1e-7 && Math.abs(p.lng - centre.lng) < 1e-7) continue;
      out.push(p);
      if (out.length >= maxPoints) return out;
    }
  }
  return out;
}

/** Rough wall-clock estimate in seconds: ~70 s fixed + ~2 s per grid point. */
export function estimateSeconds(points: number): number {
  return 70 + 2 * points;
}

export type ApifyPlan = "free" | "starter" | "scale" | "business";

/** USD per 1,000 results by plan (base results, no add-ons). */
export const RATE_PER_1000: Record<ApifyPlan, number> = {
  free: 0.5,
  starter: 0.45,
  scale: 0.4,
  business: 0.25,
};

export function estimateCostUsd(uniqueResults: number, plan: ApifyPlan): number {
  return (uniqueResults * RATE_PER_1000[plan]) / 1000 + 0.00005;
}

/**
 * Plausible unique-result range for a run. The upper bound is hard (num per
 * query); the "likely" figure uses an adjustable heuristic of results per grid
 * point and is only a planning estimate, never a promise.
 */
export function estimateResults(opts: {
  points: number;
  queries: number;
  num: number;
  perPoint?: number;
}) {
  const perPoint = opts.perPoint ?? 15;
  const max = opts.queries * opts.num;
  const likely = opts.queries * Math.min(opts.num, Math.round(opts.points * perPoint));
  return { likely, max };
}

export function polygonAreaKm2(polygon: [number, number][]): number {
  if (polygon.length < 3) return 0;
  const lat0 = polygon.reduce((a, p) => a + p[0], 0) / polygon.length;
  const kx = 111.32 * Math.cos(rad(lat0));
  const ky = 110.574;
  let sum = 0;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [yi, xi] = polygon[i];
    const [yj, xj] = polygon[j];
    sum += xj * kx * (yi * ky) - xi * kx * (yj * ky);
  }
  return Math.abs(sum) / 2;
}
