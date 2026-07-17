import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Subdomain routing: allsoullearn.* → /allsoullearn/* (previously done in
  // proxy.ts / middleware, which Cloudflare's OpenNext adapter can't run on the
  // Node runtime). Host-based rewrites are handled by Next's router instead, so
  // they work on Cloudflare Workers. Excludes _next assets and /api (shared).
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/:path((?!_next/|api/|allsoullearn).*)",
          has: [{ type: "host", value: "allsoullearn\\..*" }],
          destination: "/allsoullearn/:path",
        },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;

// Cloudflare bindings for `next dev` — makes getCloudflareContext() work locally
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
