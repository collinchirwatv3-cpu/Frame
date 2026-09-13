import { z } from "zod";

/** How far in the future a party may be scheduled — generous for real
 * planning, but bounded so a "daily"/"weekly" repeat can't be set up to
 * silently outlive any reasonable review of this cap's own value. */
const MAX_SCHEDULE_HORIZON_DAYS = 365;

/** Server-side validation for party creation (POST /api/parties) — same
 * "client claims, server re-derives/validates" posture as
 * lib/validation/upload.ts. The route additionally re-checks a per-host cap
 * on scheduled parties, which this schema can't express (it needs a DB
 * count, not just shape validation). */
export const createPartySchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(80, "Title is too long"),
    videoId: z.string().uuid(),
    visibility: z.enum(["public", "private"]).default("public"),
    scheduledAt: z.string().datetime().nullable().default(null),
    repeatRule: z.enum(["none", "daily", "weekly"]).default("none"),
  })
  .superRefine((data, ctx) => {
    if (!data.scheduledAt) {
      if (data.repeatRule !== "none") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "A repeat rule requires a scheduled time",
          path: ["repeatRule"],
        });
      }
      return;
    }

    const scheduled = new Date(data.scheduledAt);
    const now = Date.now();
    if (scheduled.getTime() < now - 60_000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Scheduled time must be in the future",
        path: ["scheduledAt"],
      });
    }
    const horizonMs = MAX_SCHEDULE_HORIZON_DAYS * 24 * 60 * 60 * 1000;
    if (scheduled.getTime() > now + horizonMs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Cannot schedule more than ${MAX_SCHEDULE_HORIZON_DAYS} days out`,
        path: ["scheduledAt"],
      });
    }
  });

export type CreatePartyInput = z.infer<typeof createPartySchema>;
