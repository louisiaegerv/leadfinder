"use client";

import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark" | "system";

export const THEME_KEY = "theme";

/**
 * Runs before first paint (via next/script beforeInteractive in the root layout) so a
 * dark-mode user never sees a white flash. A plain <script> tag makes React warn.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");var d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d)}catch(e){}})()`;

const listeners = new Set<() => void>();

function stored(): Theme {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

const systemDark = () => matchMedia("(prefers-color-scheme: dark)").matches;

function apply(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark" || (theme === "system" && systemDark()));
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const mq = matchMedia("(prefers-color-scheme: dark)");
  const onSystem = () => {
    if (stored() === "system") apply("system");
    cb();
  };
  mq.addEventListener("change", onSystem);
  window.addEventListener("storage", onSystem); // another tab changed it
  return () => {
    listeners.delete(cb);
    mq.removeEventListener("change", onSystem);
    window.removeEventListener("storage", onSystem);
  };
}

function setTheme(theme: Theme) {
  try {
    if (theme === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Storage can be blocked; the theme still applies for this page view.
  }
  apply(theme);
  listeners.forEach((l) => l());
}

/** Theme preference plus what it resolves to right now. Both are "system"/"light" until hydrated. */
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, stored, () => "system" as Theme);
  const prefersDark = useSyncExternalStore(subscribe, systemDark, () => false);
  const resolvedTheme: "light" | "dark" = theme === "dark" || (theme === "system" && prefersDark) ? "dark" : "light";
  return { theme, resolvedTheme, setTheme };
}
