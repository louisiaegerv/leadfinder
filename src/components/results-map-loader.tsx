"use client";

import dynamic from "next/dynamic";

// Leaflet touches window, so it must only load in the browser.
export const ResultsMap = dynamic(() => import("./results-map"), {
  ssr: false,
  loading: () => <div className="h-[620px] w-full animate-pulse rounded-lg border bg-muted" />,
});
