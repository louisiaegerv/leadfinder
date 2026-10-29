import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { EnrichPoller } from "@/components/enrich-poller";
import { MobileNav } from "@/components/mobile-nav";
import { Sidebar } from "@/components/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { THEME_INIT_SCRIPT } from "@/components/use-theme";
import { getActiveRuns } from "@/lib/enrich-db";
import { countDueFollowUps } from "@/lib/outreach-db";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Leadfinder",
  description: "Local business prospecting for agency outreach",
};

// "cover" lets the tab bar sit under the home-indicator area on phones (it pads itself with the safe-area inset).
export const viewport: Viewport = { viewportFit: "cover" };

export const dynamic ="force-dynamic"; // sidebar reads the local db on every request

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: the theme-init script sets the dark class before React hydrates.
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full">
        <Script id="theme-init" strategy="beforeInteractive">{THEME_INIT_SCRIPT}</Script>
        <Sidebar />
        {/* Bottom padding on phones keeps the last row clear of the tab bar. */}
        <main className="min-w-0 flex-1 p-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:p-8">{children}</main>
        <MobileNav due={countDueFollowUps()} />
        <Toaster richColors position="bottom-right" mobileOffset={{ bottom: "4.5rem" }} />
        <EnrichPoller runIds={getActiveRuns().map((r) => r.id)} />
      </body>
    </html>
  );
}
