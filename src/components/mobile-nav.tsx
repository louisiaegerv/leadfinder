"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { Database, Ellipsis, LayoutGrid, Moon, Phone, Plus, Sun, type LucideIcon } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useTheme } from "@/components/use-theme";
import { cn } from "@/lib/utils";

const noopSubscribe = () => () => {};

const tabClass = (active: boolean) =>
  cn(
    "relative flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors",
    active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
  );

const rowClass = "flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-base transition-colors hover:bg-muted";

/** Bottom tab bar for phones, where the sidebar is hidden. Two main pages, and a "More" drawer for everything else. */
export function MobileNav({ due }: { due: number }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  // The real theme is only known in the browser, so show a neutral label until hydrated.
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const dark = mounted && resolvedTheme === "dark";

  const tabs: { href: string; label: string; icon: LucideIcon; active: boolean; badge?: number }[] = [
    { href: "/", label: "Niches", icon: LayoutGrid, active: path === "/" || (path.startsWith("/niches") && path !== "/niches/new") },
    { href: "/outreach", label: "Outreach", icon: Phone, active: path.startsWith("/outreach"), badge: due },
  ];

  // Add future secondary actions here: links close the drawer when tapped, buttons stay as they are.
  const links: { href: string; label: string; icon: LucideIcon }[] = [
    { href: "/niches/new", label: "New niche", icon: Plus },
    { href: "/data", label: "Data and backup", icon: Database },
  ];

  return (
    <>
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {tabs.map(({ href, label, icon: Icon, active, badge }) => (
          <Link key={href} href={href} aria-current={active ? "page" : undefined} className={tabClass(active)}>
            <span className="relative">
              <Icon className={cn("size-5", active && "text-blue-600 dark:text-blue-400")} />
              {!!badge && badge > 0 && (
                <span className="absolute -top-1.5 -right-3 min-w-4 rounded-full bg-destructive px-1 text-center text-[10px] leading-4 font-semibold tabular-nums text-white" title={`${badge} follow-up${badge === 1 ? "" : "s"} due`}>
                  {badge}
                </span>
              )}
            </span>
            {label}
          </Link>
        ))}
        <button type="button" onClick={() => setOpen(true)} aria-label="More" aria-haspopup="dialog" aria-expanded={open} className={tabClass(open || path === "/niches/new" || path.startsWith("/data"))}>
          <Ellipsis className="size-5" />
          More
        </button>
      </nav>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="md:hidden">
          <SheetTitle>More</SheetTitle>
          <div className="space-y-0.5 overflow-y-auto p-2 pb-3">
            {links.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} onClick={() => setOpen(false)} className={rowClass}>
                <Icon className="size-5 text-muted-foreground" /> {label}
              </Link>
            ))}
            <button type="button" onClick={() => setTheme(dark ? "light" : "dark")} className={rowClass}>
              {dark ? <Sun className="size-5 text-muted-foreground" /> : <Moon className="size-5 text-muted-foreground" />}
              {dark ? "Light mode" : "Dark mode"}
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
