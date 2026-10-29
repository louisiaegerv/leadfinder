import { describe, expect, it } from "vitest";
import {
  estimateCostUsd,
  estimateSeconds,
  gridPoints,
  haversineKm,
  pointInPolygon,
  type Shape,
} from "./geo";

// Distinct search centres seen in a real run: radius ~24 km, spacing 8 km, Houston.
const CENTER = { lat: 30.07973, lng: -95.41769 };
const OBSERVED: [number, number][] = [
  [30.07973, -95.41769],
  [30.07973, -95.6668377],
  [30.07973, -95.1685423],
  [29.93503052, -95.50073923],
  [30.22442948, -95.50073923],
  [29.93503052, -95.25159153],
  [30.22442948, -95.25159153],
  [30.00738026, -95.58378847],
  [30.15207974, -95.58378847],
  [30.15207974, -95.33464077],
  [29.93503052, -95.41769],
  [30.22442948, -95.41769],
  [29.93503052, -95.58378847],
  [30.00738026, -95.50073923],
];

describe("gridPoints", () => {
  const shape: Shape = { shape: "radius", centerLat: CENTER.lat, centerLng: CENTER.lng, radiusKm: 24 };
  const pts = gridPoints(shape, 8);

  it("puts the centre point first", () => {
    expect(pts[0]).toEqual(CENTER);
  });

  it("reproduces every search centre observed in the real run", () => {
    for (const [lat, lng] of OBSERVED) {
      const hit = pts.some((p) => Math.abs(p.lat - lat) < 1e-5 && Math.abs(p.lng - lng) < 1e-5);
      expect(hit, `missing ${lat},${lng}`).toBe(true);
    }
  });

  it("excludes the +/-3 lat steps the real run never searched", () => {
    const farLat = pts.filter((p) => Math.abs(p.lat - CENTER.lat) > 0.2);
    expect(farLat).toHaveLength(0);
  });

  it("has no duplicates and stays inside the radius", () => {
    const keys = new Set(pts.map((p) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`));
    expect(keys.size).toBe(pts.length);
    for (const p of pts) expect(haversineKm(p, CENTER)).toBeLessThanOrEqual(24 + 1e-6);
  });
});

describe("polygon grid", () => {
  const square: [number, number][] = [
    [30.0, -95.5],
    [30.0, -95.3],
    [30.2, -95.3],
    [30.2, -95.5],
  ];
  it("keeps only points inside", () => {
    const pts = gridPoints({ shape: "polygon", polygon: square }, 5);
    expect(pts.length).toBeGreaterThan(4);
    for (const p of pts) expect(pointInPolygon(p, square)).toBe(true);
  });
  it("rejects points outside a concave polygon notch", () => {
    const L: [number, number][] = [
      [0, 0],
      [0, 2],
      [1, 2],
      [1, 1],
      [2, 1],
      [2, 0],
    ];
    expect(pointInPolygon({ lat: 1.5, lng: 1.5 }, L)).toBe(false);
    expect(pointInPolygon({ lat: 0.5, lng: 1.5 }, L)).toBe(true);
  });
});

describe("estimates", () => {
  it("time is 70s + 2s per point", () => expect(estimateSeconds(27)).toBe(124));
  it("cost uses the plan rate plus the start fee", () => {
    expect(estimateCostUsd(1000, "free")).toBeCloseTo(0.50005, 6);
    expect(estimateCostUsd(1000, "business")).toBeCloseTo(0.25005, 6);
  });
});
