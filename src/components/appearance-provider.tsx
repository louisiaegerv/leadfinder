"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { Appearance, PresetId, Region, RegionAppearance } from "@/lib/appearance-config";

type Style = Partial<Pick<RegionAppearance, "blur" | "overlay">>;
type Result = { ok: true } | { ok: false; error: string };

type Ctx = {
  appearance: Appearance;
  /** Update what is on screen only. Used while a slider is being dragged. */
  preview: (region: Region, style: Style) => void;
  /** Update what is on screen and keep it. */
  save: (region: Region, style: Style) => Promise<Result>;
  upload: (region: Region, file: File) => Promise<Result>;
  choosePreset: (region: Region, id: PresetId) => Promise<Result>;
  remove: (region: Region) => Promise<Result>;
};

const AppearanceContext = createContext<Ctx | null>(null);

export function useAppearance() {
  const ctx = useContext(AppearanceContext);
  if (!ctx) throw new Error("useAppearance must be used inside AppearanceProvider");
  return ctx;
}

async function send(url: string, init: RequestInit): Promise<{ result: Result; region?: RegionAppearance }> {
  try {
    const res = await fetch(url, init);
    const data = await res.json().catch(() => null);
    if (!res.ok) return { result: { ok: false, error: data?.error ?? "Something went wrong" } };
    return { result: { ok: true }, region: data };
  } catch {
    return { result: { ok: false, error: "Could not reach the app" } };
  }
}

const json = (method: string, body: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/** Holds the background settings. The server hands over the saved values, so there is no flash of an unstyled page. */
export function AppearanceProvider({ initial, children }: { initial: Appearance; children: React.ReactNode }) {
  const [appearance, setAppearance] = useState(initial);

  const patch = useCallback((region: Region, p: Partial<RegionAppearance>) => setAppearance((a) => ({ ...a, [region]: { ...a[region], ...p } })), []);

  const value = useMemo<Ctx>(() => {
    // Image changes take only the image from the reply. The sliders may have moved again while the request was in flight.
    const applyImage = (region: Region, r: { result: Result; region?: RegionAppearance }) => {
      if (r.result.ok && r.region) patch(region, { imageUrl: r.region.imageUrl });
      return r.result;
    };
    return {
      appearance,
      preview: patch,
      save: async (region, style) => {
        patch(region, style);
        return (await send(`/api/appearance/${region}`, json("PATCH", style))).result;
      },
      upload: async (region, file) => {
        const body = new FormData();
        body.append("file", file);
        return applyImage(region, await send(`/api/appearance/${region}/image`, { method: "POST", body }));
      },
      choosePreset: async (region, id) => applyImage(region, await send(`/api/appearance/${region}/preset`, json("POST", { id }))),
      remove: async (region) => applyImage(region, await send(`/api/appearance/${region}/image`, { method: "DELETE" })),
    };
  }, [appearance, patch]);

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}
