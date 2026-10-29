"use client";

import { useEffect, useRef } from "react";
import type * as LType from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import { boundingBox, type LatLng, type Shape } from "@/lib/geo";

type Props = {
  shape: Shape | null;
  /** Search grid points to preview. */
  points: LatLng[];
  onShape: (s: Shape | null) => void;
  flyTo?: { lat: number; lng: number; zoom?: number } | null;
  className?: string;
};

const MAX_RENDERED_POINTS = 1500;
const SHAPE_STYLE = { color: "#2563eb", weight: 2, fillOpacity: 0.12 };

/**
 * Leaflet + leaflet-draw map. Draw a polygon or a circle (radius); both are
 * reported to the parent as a Shape. The parent owns the truth, so typed
 * values and loaded areas flow back in through the `shape` prop.
 */
export default function AreaMap({ shape, points, onShape, flyTo, className }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const api = useRef<{
    L: typeof LType;
    map: LType.Map;
    drawn: LType.FeatureGroup;
    grid: LType.LayerGroup;
  } | null>(null);
  const lastEmitted = useRef<string>("");
  const onShapeRef = useRef(onShape);
  onShapeRef.current = onShape;
  const initial = useRef({ shape, points });

  // Mount once.
  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    (async () => {
      const L = (await import("leaflet")).default;
      (window as unknown as { L: typeof L }).L = L; // leaflet-draw expects a global
      await import("leaflet-draw");
      if (disposed || !el.current) return;

      const map = L.map(el.current, { center: [39.5, -98.35], zoom: 4, zoomControl: true });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);
      const drawn = new L.FeatureGroup().addTo(map);
      const grid = new L.LayerGroup().addTo(map);

      map.addControl(
        new L.Control.Draw({
          position: "topleft",
          draw: {
            polygon: { allowIntersection: false, showArea: false, shapeOptions: SHAPE_STYLE },
            circle: { shapeOptions: SHAPE_STYLE },
            rectangle: false,
            polyline: false,
            marker: false,
            circlemarker: false,
          },
          edit: { featureGroup: drawn },
        }),
      );

      const emit = (layer: LType.Layer) => {
        let s: Shape;
        if (layer instanceof L.Circle) {
          const c = layer.getLatLng();
          s = { shape: "radius", centerLat: c.lat, centerLng: c.lng, radiusKm: layer.getRadius() / 1000 };
        } else {
          const ring = (layer as LType.Polygon).getLatLngs()[0] as LType.LatLng[];
          s = { shape: "polygon", polygon: ring.map((p) => [p.lat, p.lng] as [number, number]) };
        }
        lastEmitted.current = JSON.stringify(s);
        onShapeRef.current(s);
      };

      map.on(L.Draw.Event.CREATED, (e) => {
        drawn.clearLayers(); // one shape per area: radius OR polygon, never both
        const layer = (e as LType.DrawEvents.Created).layer;
        drawn.addLayer(layer);
        emit(layer);
      });
      map.on(L.Draw.Event.EDITED, () => drawn.eachLayer((l) => emit(l)));
      map.on(L.Draw.Event.DELETED, () => {
        lastEmitted.current = "null";
        onShapeRef.current(null);
      });

      api.current = { L, map, drawn, grid };
      cleanup = () => {
        map.remove();
        api.current = null;
      };
      // Apply props that arrived before the map was ready.
      syncShape(initial.current.shape, true);
      syncPoints(initial.current.points);
    })();
    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  function syncShape(s: Shape | null, fit: boolean) {
    const a = api.current;
    if (!a) return;
    const key = JSON.stringify(s);
    if (!fit && key === lastEmitted.current) return; // change came from the map itself
    lastEmitted.current = key;
    a.drawn.clearLayers();
    if (!s) return;
    const layer =
      s.shape === "radius"
        ? a.L.circle([s.centerLat, s.centerLng], { radius: s.radiusKm * 1000, ...SHAPE_STYLE })
        : a.L.polygon(s.polygon, SHAPE_STYLE);
    a.drawn.addLayer(layer);
    if (fit) {
      const b = boundingBox(s);
      a.map.fitBounds([[b.south, b.west], [b.north, b.east]], { padding: [30, 30] });
    }
  }

  function syncPoints(pts: LatLng[]) {
    const a = api.current;
    if (!a) return;
    a.grid.clearLayers();
    pts.slice(0, MAX_RENDERED_POINTS).forEach((p, i) =>
      a.L.circleMarker([p.lat, p.lng], {
        radius: i === 0 ? 5 : 3,
        color: i === 0 ? "#dc2626" : "#1d4ed8",
        weight: 1,
        fillOpacity: 0.9,
      }).addTo(a.grid),
    );
  }

  useEffect(() => syncShape(shape, false)); // runs after every render; guarded by lastEmitted
  useEffect(() => syncPoints(points), [points]);
  useEffect(() => {
    if (flyTo && api.current) api.current.map.flyTo([flyTo.lat, flyTo.lng], flyTo.zoom ?? 10);
  }, [flyTo]);

  return <div ref={el} className={className ?? "h-[520px] w-full rounded-lg border"} style={{ isolation: "isolate" }} />;
}
