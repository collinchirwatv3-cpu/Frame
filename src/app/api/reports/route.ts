import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { engagementRateLimiter, checkRateLimit, rateLimitedResponse } from "@/lib/rate-limit";

const bodySchema = z.object({
  videoId: z.string().uuid(),
  reason: z.enum(["spam", "csam", "harassment", "copyright", "other"]).default("other"),
});

// Server-side insert, not a direct client write, so a report can't be
// spoofed or tampered with in transit — matches MIGRATION_PLAN.md's
// original note on why this needed to be a Route Handler, not a client
// Supabase call straight from VideoOptionsSheet.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const rateLimit = await checkRateLimit(engagementRateLimiter, user.id);
  if (!rateLimit.success) {
    return rateLimitedResponse(rateLimit);
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid report" }, { status: 400 });
  }

  const { error } = await supabase.from("reports").insert({
    video_id: parsed.data.videoId,
    reporter_id: user.id,
    reason: parsed.data.reason,
  });

  if (error) {
    return NextResponse.json({ error: "Could not submit your report" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
