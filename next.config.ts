import type { NextConfig } from "next";

// Content-Security-Policy — pragmatic baseline.
// NOTE: the app relies on inline styles everywhere (style={{…}}) and Next.js
// injects inline bootstrap scripts, so 'unsafe-inline' is required for both
// script-src and style-src. This still blocks external script injection,
// clickjacking (frame-ancestors), and mixed content. A strict nonce-based CSP
// would require removing all inline styles — out of scope for now.
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  // data:/blob: needed by the image cropper (fetch(canvas.toDataURL()) → Blob).
  "connect-src 'self' data: blob: https://accounts.google.com https://oauth2.googleapis.com https://www.googleapis.com",
  // Google Maps embeds (workshop/location pages) + Stripe checkout return.
  "frame-src 'self' https://maps.google.com https://www.google.com https://checkout.stripe.com",
  "frame-ancestors 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;

// Cloudflare bindings for `next dev` — makes getCloudflareContext() work locally.
// Only for dev: it starts the local workerd runtime, which a production build
// never needs (and which a locked-down Windows may refuse to run).
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
if (process.env.NODE_ENV === "development") initOpenNextCloudflareForDev();
