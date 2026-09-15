import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";

/**
 * Rate limiting for mutating Route Handlers — in real use by ads/serve,
 * uploads, uploads/thumbnail, watch-sessions/start, watch-sessions/
 * heartbeat, engagement/[kind], invite/validate, invite/redeem, account,
 * reports, and moderation/reports/[reportId].
 *
 * Degrades gracefully with no Upstash credentials set (local dev and CI
 * never provision Redis) — every check succeeds instead of throwing.
 * Production fails closed instead when unconfigured (see checkRateLimit
 * below); real Upstash credentials are set in Vercel's production env.
 */
const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

function makeLimiter(requests: number, window: `${number} ${"s" | "m" | "h"}`, prefix: string) {
  if (!redis) return null;
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(requests, window),
    prefix: `frame:${prefix}`,
    analytics: true,
  });
}

/** Auth endpoints (OTP request, OAuth callback) — tight, since these are the
 * classic credential-stuffing/OTP-spam target. */
export const authRateLimiter = makeLimiter(5, "1 m", "auth");

/** Upload creation — generous enough for a real creator session, tight
 * enough to stop a scripted flood of low-effort uploads. */
export const uploadRateLimiter = makeLimiter(10, "1 h", "upload");

/** Likes/comments/follows/reports — the highest-volume, lowest-risk-per-call
 * surface; a loose limit mainly to blunt bot spam, not to constrain real use. */
export const engagementRateLimiter = makeLimiter(60, "1 m", "engagement");

/** Moderator actions on a report (dismiss/remove video/ban creator) — not a
 * public-facing abuse surface (gated to is_moderator server-side regardless),
 * generous enough that triaging a real report queue in one sitting never
 * hits it, tight enough to still bound the blast radius of a compromised
 * moderator session. */
export const moderationRateLimiter = makeLimiter(30, "1 m", "moderation");

/** Starting a watch session — one call per video someone starts watching,
 * similar volume to engagement actions (scrolling through many shorts). */
export const watchSessionStartRateLimiter = makeLimiter(60, "1 m", "watch-session-start");

/** Heartbeats fire repeatedly *during* a single session (every few seconds
 * of playback), a much higher natural call volume than starting a session
 * — a separate, looser limiter rather than sharing one with start and
 * getting either wrong. */
export const watchSessionHeartbeatRateLimiter = makeLimiter(120, "1 m", "watch-session-heartbeat");

/** Serving an ad slot — similar volume to starting a watch session (once
 * per feed position/video that could show one). */
export const adServeRateLimiter = makeLimiter(60, "1 m", "ad-serve");

/** Posting a comment — tighter than the generic engagement toggle limiter
 * (likes/saves/follows) since a comment carries free-text content and is
 * the one write in that family that never went through a rate-limited
 * route until now (comments-store.ts wrote directly from the browser). */
export const commentRateLimiter = makeLimiter(20, "1 m", "comment");

/** Creating a scheduled watch party — tight relative to a real host's
 * actual usage, since each scheduled party is a future notification fan-out
 * to every follower: without a limit here, a scripted flood of creations
 * (each immediately due) turns into a scripted flood of follower spam the
 * moment the notify-scheduled cron runs. Generous enough that a real host
 * planning a week of parties never hits it. */
export const partyCreateRateLimiter = makeLimiter(10, "1 h", "party-create");

/** Blocking/unblocking — a rare, deliberate action (unlike the high-volume
 * engagement toggles), tight enough to still bound a scripted mass-block. */
export const blockRateLimiter = makeLimiter(30, "1 h", "block");

/** Sending a DM — same reasoning as commentRateLimiter (free-text content,
 * the classic spam-bot target), tight enough to blunt a scripted flood
 * without constraining a real conversation. */
export const dmMessageRateLimiter = makeLimiter(30, "1 m", "dm-message");

/** Registering/removing a push subscription — a one-time-per-device action
 * in normal use, loose enough that a device with a flaky permission prompt
 * retrying a few times never hits it, tight enough to bound abuse of the
 * insert path (see register_push_subscription's own endpoint-allowlist
 * check for the more serious SSRF concern this doesn't cover). */
export const pushSubscriptionRateLimiter = makeLimiter(20, "1 m", "push-subscription");

export type RateLimitResult = { success: boolean; limit: number; remaining: number; reset: number };

export async function checkRateLimit(
  limiter: Ratelimit | null,
  identifier: string
): Promise<RateLimitResult> {
  if (!limiter) {
    // Local development and CI do not provision Redis. Production must: a
    // missing limiter on a public mutation endpoint is an abuse bypass, not
    // a harmless degraded mode. (Briefly reverted to permissive on
    // 2026-09-14 because Upstash had never actually been provisioned in
    // Vercel's production env — real credentials are now set there, so
    // this fails closed for real, not just in theory.)
    if (process.env.NODE_ENV === "production") {
      return { success: false, limit: 0, remaining: 0, reset: Date.now() + 60_000 };
    }
    return { success: true, limit: Infinity, remaining: Infinity, reset: 0 };
  }
  const result = await limiter.limit(identifier);
  return result;
}

/** Standard 429 response shape, reused by every rate-limited route so
 * clients get a consistent contract (Retry-After + JSON body). */
export function rateLimitedResponse(result: RateLimitResult) {
  return NextResponse.json(
    { error: "Too many requests. Please slow down." },
    {
      status: 429,
      headers: {
        "Retry-After": Math.max(0, Math.ceil((result.reset - Date.now()) / 1000)).toString(),
        "X-RateLimit-Limit": result.limit.toString(),
        "X-RateLimit-Remaining": result.remaining.toString(),
      },
    }
  );
}
