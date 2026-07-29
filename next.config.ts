import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

export default nextConfig;

// Cloudflare bindings for `next dev` — makes getCloudflareContext() work locally
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
