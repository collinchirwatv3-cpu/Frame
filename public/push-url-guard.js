// Same-origin, path-only allowlist for push-notification click routing.
// Loaded into the service worker via importScripts (a classic worker
// script — broadest cross-browser support, no ES-module-service-worker
// requirement) and required directly by src/lib/push-url-guard.test.ts, so
// there is exactly one implementation, not a copy that can drift from what
// the service worker actually runs at click time.
function isSafeFrameDmUrl(url) {
  return typeof url === "string" && /^\/inbox\/messages\/[a-zA-Z0-9-]{1,100}$/.test(url);
}

if (typeof module !== "undefined") {
  module.exports = { isSafeFrameDmUrl };
}
