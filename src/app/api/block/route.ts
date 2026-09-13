import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { blockRateLimiter, checkRateLimit, rateLimitedResponse } from "@/lib/rate-limit";

// Blocking needs a route, not a direct client insert like the engagement
// toggles — it has a real side effect beyond its own table: force-ending
// any existing follow relationship in BOTH directions. The blocker's own
// follow row is deletable under the caller's own RLS (follows_delete_own:
// auth.uid() = follower_id), but the reverse direction (the target
// following the blocker) is not the caller's row, so that half needs a
// service-role write — same reasoning as /api/parties' host_id write.
const bodySchema = z.object({
  targetId: z.string().uuid(),
  // true = block, false = unblock. Mirrors engagement/[kind]'s own
  // active-flag convention.
  active: z.boolean(),
});

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const rateLimit = await checkRateLimit(blockRateLimiter, user.id);
  if (!rateLimit.success) {
    return rateLimitedResponse(rateLimit);
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { targetId, active } = parsed.data;
  if (targetId === user.id) {
    return NextResponse.json({ error: "You can't block yourself" }, { status: 400 });
  }

  if (!active) {
    const { error } = await supabase.from("blocks").delete().eq("blocker_id", user.id).eq("blocked_id", targetId);
    if (error) {
      return NextResponse.json({ error: "Could not unblock that person" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  const { error: insertError } = await supabase
    .from("blocks")
    .insert({ blocker_id: user.id, blocked_id: targetId });
  // 23505 = unique_violation (already blocked) — treat as success so a
  // double-tap or a stale client retry isn't an error.
  if (insertError && insertError.code !== "23505") {
    return NextResponse.json({ error: "Could not block that person" }, { status: 500 });
  }

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  await service.from("follows").delete().eq("follower_id", user.id).eq("followee_id", targetId);
  await service.from("follows").delete().eq("follower_id", targetId).eq("followee_id", user.id);

  return NextResponse.json({ ok: true });
}
