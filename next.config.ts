import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// Static security headers — anything needing a per-request value (the CSP
// nonce) lives in src/proxy.ts instead, since next.config.ts headers() can't
// vary per request.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    // camera/microphone are needed for in-app recording (CameraCapture.tsx)
    // — scoped to same-origin, not the wide-open default.
    value: "camera=(self), microphone=(self), geolocation=(), interest-cohort=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "*.r2.dev" },
      // Cloudflare Stream serves thumbnails from a per-account
      // customer-<code>.cloudflarestream.com subdomain — see
      // src/lib/security-headers.ts for why this replaced videodelivery.net.
      { protocol: "https", hostname: "*.cloudflarestream.com" },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

// Safe to leave wrapped with no Sentry project provisioned yet — without
// SENTRY_AUTH_TOKEN the source-map upload step just skips itself and warns
// at build time rather than failing the build.
export default withSentryConfig(nextConfig, {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
});
