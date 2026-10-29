import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page reads the local SQLite db per request, so Cache Components (the
  // scaffold default) would only add Suspense boundaries and stale hidden routes.
  cacheComponents: false,
  // Lets the dev server be opened from another device on the LAN.
  allowedDevOrigins: ["192.168.1.169"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};



export default nextConfig;
