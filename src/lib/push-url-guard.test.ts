import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

// Requires the actual file the service worker loads via importScripts
// (public/push-url-guard.js) — one implementation, not a parallel copy
// that could drift from what runs at notification-click time.
const require = createRequire(import.meta.url);
const { isSafeFrameDmUrl } = require("../../public/push-url-guard.js");

describe("isSafeFrameDmUrl", () => {
  it("allows a real DM thread path", () => {
    expect(isSafeFrameDmUrl("/inbox/messages/44ec8be3-32c6-4dec-a2bb-23f04121c4d4")).toBe(true);
  });

  it("rejects an absolute/external URL", () => {
    expect(isSafeFrameDmUrl("https://evil.example/inbox/messages/x")).toBe(false);
  });

  it("rejects a protocol-relative URL", () => {
    expect(isSafeFrameDmUrl("//evil.example/inbox/messages/x")).toBe(false);
  });

  it("rejects a path outside the DM thread route", () => {
    expect(isSafeFrameDmUrl("/settings")).toBe(false);
    expect(isSafeFrameDmUrl("/inbox")).toBe(false);
  });

  it("rejects non-string input", () => {
    expect(isSafeFrameDmUrl(undefined)).toBe(false);
    expect(isSafeFrameDmUrl(null)).toBe(false);
    expect(isSafeFrameDmUrl(123)).toBe(false);
  });
});
