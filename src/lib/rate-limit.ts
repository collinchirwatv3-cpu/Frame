import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";

/**
 * Rate limiting for every future mutating Route Handler/Server Action —
 * there are no real endpoints to attach this to yet (see MIGRATION_PLAN.md),
 * but the limiter classes and the "no Redis configured" fallback are the
 * pattern to build against once there are.
 *
 * Degrades gracefully with no Upstash credentials set (local dev, CI, and
 * this early stage of the project) — every check succeeds instead of
 * throwing, so nothing breaks before Redis is provisioned. This must never
 * silently stay in that state in real production; `MIGRATION_PLAN.md` calls
 * out enabling real credentials as a Critical item.
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

export type RateLimitResult = { success: boolean; limit: number; remaining: number; reset: number };

export async function checkRateLimit(
  limiter: Ratelimit | null,
  identifier: string
): Promise<RateLimitResult> {
  if (!limiter) {
    // No Redis configured — allow everything through rather than fail closed
    // in local/CI environments. See module doc comment.
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
