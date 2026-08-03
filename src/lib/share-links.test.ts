import { describe, expect, it } from "vitest";
import { formatRelativeExpiry, generateToken, getShareLinkStatus, TTL_MS } from "./share-links";
import type { ShareLink } from "./types";

function makeLink(overrides: Partial<ShareLink> = {}): ShareLink {
  return {
    token: "abc123",
    videoId: "v1",
    createdAt: 0,
    expiresAt: TTL_MS["24h"],
    revokedAt: null,
    viewCount: 0,
    ...overrides,
  };
}

describe("getShareLinkStatus", () => {
  it("is active before expiry and with no revocation", () => {
    const link = makeLink({ expiresAt: 1000 });
    expect(getShareLinkStatus(link, 500)).toBe("active");
  });

  it("is expired once now passes expiresAt", () => {
    const link = makeLink({ expiresAt: 1000 });
    expect(getShareLinkStatus(link, 1000)).toBe("expired");
    expect(getShareLinkStatus(link, 1500)).toBe("expired");
  });

  it("is revoked regardless of expiry, even if revoked before expiry", () => {
    const link = makeLink({ expiresAt: 10_000, revokedAt: 500 });
    expect(getShareLinkStatus(link, 600)).toBe("revoked");
  });

  it("revocation takes priority over expiry when both are true", () => {
    const link = makeLink({ expiresAt: 1000, revokedAt: 1200 });
    expect(getShareLinkStatus(link, 1500)).toBe("revoked");
  });
});

describe("generateToken", () => {
  it("produces a 10-character alphanumeric token", () => {
    const token = generateToken();
    expect(token).toHaveLength(10);
    expect(token).toMatch(/^[a-zA-Z0-9]+$/);
  });

  it("produces different tokens across calls", () => {
    const tokens = new Set(Array.from({ length: 20 }, () => generateToken()));
    expect(tokens.size).toBe(20);
  });
});

describe("formatRelativeExpiry", () => {
  it("reports minutes for durations under an hour", () => {
    const now = 0;
    expect(formatRelativeExpiry(30 * 60_000, now)).toBe("Expires in 30m");
  });

  it("reports hours for durations under 48 hours", () => {
    const now = 0;
    expect(formatRelativeExpiry(5 * 60 * 60_000, now)).toBe("Expires in 5h");
  });

  it("reports days for longer durations", () => {
    const now = 0;
    expect(formatRelativeExpiry(3 * 24 * 60 * 60_000, now)).toBe("Expires in 3d");
  });

  it("reports Expired once the time has passed", () => {
    expect(formatRelativeExpiry(0, 1000)).toBe("Expired");
  });
});
