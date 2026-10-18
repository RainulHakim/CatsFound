import type { NextConfig } from "next";

// Static security headers for every response, including static assets.
// The CSP is per-request (it carries a nonce) and is set in proxy.ts.
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), geolocation=(self), microphone=(), payment=(), usb=()",
  },
];

const nextConfig: NextConfig = {
  // Cache Components / PPR is incompatible with nonce-based CSP. See DECISIONS.md.
  cacheComponents: false,
  poweredByHeader: false,
  // Photos are resized in the browser first (≈300–500 KB each, max 4).
  // Vercel caps request bodies at 4.5 MB, so stay just under it.
  experimental: { serverActions: { bodySizeLimit: "4.4mb" } },
  serverExternalPackages: ["sharp"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
