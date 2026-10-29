import type { Area } from "@/db/schema";
import { haversineKm, inShape, shapeCenter, type Shape } from "./geo";

export type AreaShapeInput = Pick<
  Area,
  "shape" | "centerLat" | "centerLng" | "radiusKm" | "polygon"
>;

/** Radius OR polygon, never both. Throws if the stored row is inconsistent. */
export function areaShape(a: AreaShapeInput): Shape {
  if (a.shape === "radius") {
    if (a.centerLat == null || a.centerLng == null || !a.radiusKm || a.radiusKm <= 0) {
      throw new Error("Radius area needs a centre and a positive radius");
    }
    if (a.polygon && a.polygon.length) throw new Error("Area has both a radius and a polygon");
    return { shape: "radius", centerLat: a.centerLat, centerLng: a.centerLng, radiusKm: a.radiusKm };
  }
  if (!a.polygon || a.polygon.length < 3) throw new Error("Polygon area needs at least 3 points");
  if (a.radiusKm) throw new Error("Area has both a radius and a polygon");
  return { shape: "polygon", polygon: a.polygon };
}

/**
 * A place belongs to the area that contains it. With overlapping areas it is
 * still one place: prefer the run's own area if it contains the place,
 * otherwise the containing area with the nearest centre. Places with no
 * coordinates, or outside every area, fall back to the run's area.
 */
export function assignArea(
  loc: { lat: number | null; lng: number | null },
  areas: { id: number; shape: Shape }[],
  runAreaId: number,
): number {
  if (loc.lat == null || loc.lng == null) return runAreaId;
  const p = { lat: loc.lat, lng: loc.lng };
  const containing = areas.filter((a) => inShape(p, a.shape));
  if (containing.length === 0) return runAreaId;
  if (containing.some((a) => a.id === runAreaId)) return runAreaId;
  return containing
    .map((a) => ({ id: a.id, d: haversineKm(p, shapeCenter(a.shape)) }))
    .sort((x, y) => x.d - y.d)[0].id;
}
