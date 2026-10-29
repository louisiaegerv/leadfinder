import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { EnrichPoller } from "@/components/enrich-poller";
import { Sidebar } from "@/components/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { THEME_INIT_SCRIPT } from "@/components/use-theme";
import { getActiveRuns } from "@/lib/enrich-db";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Leadfinder",
  description: "Local business prospecting for agency outreach",
};

export const dynamic = "force-dynamic"; // sidebar reads the local db on every request

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: the theme-init script sets the dark class before React hydrates.
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full">
        <Script id="theme-init" strategy="beforeInteractive">{THEME_INIT_SCRIPT}</Script>
        <Sidebar />
        <main className="min-w-0 flex-1 p-6 md:p-8">{children}</main>
        <Toaster richColors position="bottom-right" />
        <EnrichPoller runIds={getActiveRuns().map((r) => r.id)} />
      </body>
    </html>
  );
}
