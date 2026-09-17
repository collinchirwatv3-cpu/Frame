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
/** In dev only, when NEXT_PUBLIC_SUPABASE_URL points at a local Supabase
 * instance (`supabase start`, e.g. http://127.0.0.1:54321) rather than a
 * real *.supabase.co project, connect-src needs that exact origin (plus
 * its ws: counterpart for Realtime) — the *.supabase.co allowance below
 * doesn't cover it and localhost dev/testing would otherwise be silently
 * blocked by CSP rather than actually exercising the app. Never applies
 * in production, where NEXT_PUBLIC_SUPABASE_URL is always the real
 * project and this returns nothing extra. */
function localSupabaseOrigins(): string[] {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return [];
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return [];
  }
  if (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") return [];
  const httpOrigin = parsed.origin;
  const wsOrigin = `${parsed.protocol === "https:" ? "wss:" : "ws:"}//${parsed.host}`;
  return [httpOrigin, wsOrigin];
}

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
      // UploadDropzone's local file preview and captured cover-frame swatch.
      "blob:",
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
      // Local file inspection, preview, and recorded-video playback.
      "blob:",
      "https://*.r2.dev",
      "https://*.cloudflarestream.com",
    ],
    "connect-src": [
      "'self'",
      // Direct creator uploads use TUS requests to Stream's upload hosts.
      "https://*.videodelivery.net",
      "https://*.cloudflarestream.com",
      "https://*.supabase.co",
      // Realtime (useWatchRoom's sync channel) connects over a WebSocket,
      // not plain HTTPS — connect-src matches by scheme, so the https:
      // entry above does NOT implicitly cover this; needs its own wss: entry.
      "wss://*.supabase.co",
      "https://*.r2.dev",
      ...(isDev ? localSupabaseOrigins() : []),
    ],
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
