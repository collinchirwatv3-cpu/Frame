import type { ShareLink, ShareLinkStatus, ShareLinkTTL } from "./types";

export const TTL_MS: Record<ShareLinkTTL, number> = {
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
};

export const TTL_LABEL: Record<ShareLinkTTL, string> = {
  "1h": "1 hour",
  "24h": "24 hours",
  "7d": "7 days",
};

export function getShareLinkStatus(link: ShareLink, now: number = Date.now()): ShareLinkStatus {
  if (link.revokedAt !== null) return "revoked";
  if (now >= link.expiresAt) return "expired";
  return "active";
}

/** Short, URL-friendly token — not cryptographically hardened (this is a
 * client-only demo store), but unguessable enough that no one stumbles into
 * a live link by chance. Real implementation: minted server-side, checked
 * against a `share_links` table on every request. */
export function generateToken(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export function formatRelativeExpiry(expiresAt: number, now: number = Date.now()): string {
  const diffMs = expiresAt - now;
  if (diffMs <= 0) return "Expired";
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 60) return `Expires in ${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `Expires in ${hours}h`;
  const days = Math.round(hours / 24);
  return `Expires in ${days}d`;
}
