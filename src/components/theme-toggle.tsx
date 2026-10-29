"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/use-theme";

const noopSubscribe = () => () => {};

/** True for places where typing a letter should not trigger a shortcut. */
function isTyping(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName);
}

/** Sun/moon button; the letter D flips the theme from anywhere outside a text field. */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // The real theme is only known in the browser, so render a neutral icon until hydrated.
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const dark = mounted && resolvedTheme === "dark";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "d" || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.repeat) return;
      if (isTyping(e.target) || document.querySelector('[role="dialog"]')) return;
      setTheme(resolvedTheme === "dark" ? "light" : "dark");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [resolvedTheme, setTheme]);

  return (
    <button
      type="button"
      onClick={() => setTheme(dark ? "light" : "dark")}
      title={`Switch to ${dark ? "light" : "dark"} mode (D)`}
      aria-label={`Switch to ${dark ? "light" : "dark"} mode`}
      className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}
