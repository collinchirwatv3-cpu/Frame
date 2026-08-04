/** Builds the Content-Security-Policy header. Needs a per-request nonce (for
 * script-src), so it's computed in `proxy.ts` (middleware) rather than the
 * static `headers()` in `next.config.ts` — everything that doesn't need a
 * nonce lives there instead.
 *
 * Known, accepted gap in this policy:
 *  - `style-src` allows `'unsafe-inline'`. This app uses inline `style` props
 *    pervasively (dynamic aspect-ratio boxes, Framer Motion transforms) —
 *    nonce-based style-src would need a broader refactor away from inline
 *    styles first. script-src is the one that matters most and is locked down.
 * Treat this as a starting point verified against real CSP violation reports
 * (`report-uri`/`report-to`) after launch, not a policy that's "done."
 *
 *  - `'unsafe-eval'` is added to script-src in development ONLY. React's dev
 *    mode genuinely needs eval() for Fast Refresh/debugging — without this,
 *    the dev server throws "eval() is not supported in this environment" and
 *    the app fails to hydrate. Production never needs it and never gets it.
 */
export function buildContentSecurityPolicy(nonce: string): string {
  const isDev = process.env.NODE_ENV !== "production";

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(isDev ? ["'unsafe-eval'"] : []),
    ],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": [
      "'self'",
      "data:",
      "https://*.supabase.co",
      "https://*.r2.dev",
      // Cloudflare Stream serves thumbnails from a per-account
      // customer-<code>.cloudflarestream.com subdomain, not a fixed host —
      // verified against Cloudflare's docs, not videodelivery.net (that's
      // Stream's upload/embed domain, unused by this app's plain <video>
      // player, which points straight at the HLS manifest).
      "https://*.cloudflarestream.com",
    ],
    "media-src": [
      "'self'",
      "https://*.r2.dev",
      "https://*.cloudflarestream.com",
    ],
    "connect-src": ["'self'", "https://*.supabase.co", "https://*.r2.dev"],
    "font-src": ["'self'"],
    "object-src": ["'none'"],
    "frame-ancestors": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "upgrade-insecure-requests": [],
  };

  return Object.entries(directives)
    .map(([key, values]) => (values.length > 0 ? `${key} ${values.join(" ")}` : key))
    .join("; ");
}
