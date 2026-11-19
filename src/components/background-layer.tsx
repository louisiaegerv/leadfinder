"use client";

import { useAppearance } from "@/components/appearance-provider";
import type { Region } from "@/lib/appearance-config";
import { cn } from "@/lib/utils";

/**
 * A background picture for the sidebar or the main area, with a wash of the theme's own colour on top.
 * Because the wash uses the theme token, light and dark mode tint it light or dark and the text stays readable.
 *
 * Sidebar: place inside the sidebar, which must be `relative isolate` so this sits above its own background but below its content.
 * Main: pinned to the window so it stays put while the page scrolls. It starts after the sidebar (w-64) on wide screens.
 */
export function BackgroundLayer({ region }: { region: Region }) {
  const { imageUrl, blur, overlay } = useAppearance().appearance[region];
  if (!imageUrl) return null;
  return (
    <div aria-hidden data-main-bg={region === "main" ? "" : undefined} className={cn("pointer-events-none -z-10 overflow-hidden", region === "sidebar" ? "absolute inset-0" : "fixed inset-y-0 right-0 left-0 md:left-64")}>
      {/* Pushed past the edges so the soft, see-through border a blur creates falls outside the visible area. */}
      <div className="absolute bg-cover bg-center" style={{ inset: -blur * 2, backgroundImage: `url("${imageUrl}")`, filter: blur ? `blur(${blur}px)` : undefined }} />
      <div className={cn("absolute inset-0", region === "sidebar" ? "bg-sidebar" : "bg-background")} style={{ opacity: overlay / 100 }} />
    </div>
  );
}
