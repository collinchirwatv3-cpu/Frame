import { z } from "zod";

/** Mirrors register_push_subscription()'s own checks
 * (20260918100000_dm_web_push.sql) so a bad request fails here with a
 * clear 400 instead of a raw Postgres error — the database function is
 * still the real boundary (endpoint-host allowlist included), not this. */
export const registerPushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(1024),
  p256dh: z.string().min(1).max(256),
  auth: z.string().min(1).max(256),
  userAgent: z.string().max(256).optional(),
});

export const removePushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(1024),
});
