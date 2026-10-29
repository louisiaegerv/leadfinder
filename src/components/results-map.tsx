"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import { boundingBox, type Shape } from "@/lib/geo";
import { OFFER_LABEL, type OfferKey } from "@/lib/offers";
import { TIER_HEX } from "@/lib/offer-ui";
import { tierOf } from "@/lib/scoring";

export type MapPoint = {
  placeId: string;
  title: string;
  lat: number;
  lng: number;
  score: number | null;
  leadOffer: OfferKey | null;
};

type Props = { nicheId: number; points: MapPoint[]; areas: { name: string; shape: Shape }[] };

/** Scored results on a map, coloured by tier. Popups are built with textContent: business names are untrusted. */
export default function ResultsMap({ nicheId, points, areas }: Props) {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    (async () => {
      const L = (await import("leaflet")).default;
      if (disposed || !el.current) return;
      const map = L.map(el.current, { center: [39.5, -98.35], zoom: 4 });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);

      const bounds = L.latLngBounds([]);
      for (const a of areas) {
        const style = { color: "#2563eb", weight: 1.5, fillOpacity: 0.04, dashArray: "4 4" };
        const layer =
          a.shape.shape === "radius"
            ? L.circle([a.shape.centerLat, a.shape.centerLng], { radius: a.shape.radiusKm * 1000, ...style })
            : L.polygon(a.shape.polygon, style);
        layer.bindTooltip(a.name, { sticky: true }).addTo(map);
        const b = boundingBox(a.shape);
        bounds.extend([b.south, b.west]).extend([b.north, b.east]);
      }

      // Lowest scores first so the best prospects draw on top.
      [...points].reverse().forEach((p) => {
        const tier = tierOf(p.score);
        const m = L.circleMarker([p.lat, p.lng], {
          radius: tier === "A" ? 8 : tier === "B" ? 6.5 : 5,
          color: "#ffffff",
          weight: 1.5,
          fillColor: TIER_HEX[tier],
          fillOpacity: 0.95,
        }).addTo(map);

        const box = document.createElement("div");
        const name = document.createElement("div");
        name.style.fontWeight = "600";
        name.textContent = p.title;
        const meta = document.createElement("div");
        meta.textContent = `Tier ${tier} · score ${p.score ?? "–"}${p.leadOffer ? ` · ${OFFER_LABEL[p.leadOffer]}` : ""}`;
        const link = document.createElement("a");
        link.href = `/niches/${nicheId}/places/${encodeURIComponent(p.placeId)}`;
        link.textContent = "Open details";
        link.style.color = "#2563eb";
        box.append(name, meta, link);
        m.bindPopup(box);
        bounds.extend([p.lat, p.lng]);
      });

      if (bounds.isValid()) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 13 });
      cleanup = () => map.remove();
    })();
    return () => {
      disposed = true;
      cleanup();
    };
  }, [nicheId, points, areas]);

  return <div ref={el} className="h-[620px] w-full rounded-lg border" style={{ isolation: "isolate" }} />;
}
