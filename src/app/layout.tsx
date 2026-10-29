import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Leadfinder",
  description: "Local business prospecting for agency outreach",
};

export const dynamic = "force-dynamic"; // sidebar reads the local db on every request

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full">
        <Sidebar />
        <main className="min-w-0 flex-1 p-6 md:p-8">{children}</main>
        <Toaster richColors position="bottom-right" />
      </body>
    </html>
  );
}
