import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { registerPushSubscriptionSchema, removePushSubscriptionSchema } from "@/lib/validation/push";
import { pushSubscriptionRateLimiter, checkRateLimit, rateLimitedResponse } from "@/lib/rate-limit";

// Registration goes through register_push_subscription() (RLS-scoped
// client, but the function itself is SECURITY DEFINER) — see that
// function's own comment for why insert can't be a plain RLS policy
// (upsert-by-endpoint + the endpoint allowlist check). Ownership is
// derived from auth.uid() inside the function, never from anything in the
// request body.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const rateLimit = await checkRateLimit(pushSubscriptionRateLimiter, user.id);
  if (!rateLimit.success) {
    return rateLimitedResponse(rateLimit);
  }

  const parsed = registerPushSubscriptionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { endpoint, p256dh, auth, userAgent } = parsed.data;

  const { error } = await supabase.rpc("register_push_subscription", {
    p_endpoint: endpoint,
    p_p256dh: p256dh,
    p_auth: auth,
    p_user_agent: userAgent ?? null,
  });

  if (error) {
    // Never echo the raw db error (could restate the rejected endpoint) —
    // same "don't leak the raw db error" posture as every other route
    // here.
    return NextResponse.json({ error: "Could not register for push notifications" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

// Deletes the caller's own row for one endpoint (the "disable push on this
// device" affordance) — RLS's push_subscriptions_delete_own policy is the
// real ownership boundary; scoping the query to user.id here is
// defense-in-depth, not the only check.
export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const rateLimit = await checkRateLimit(pushSubscriptionRateLimiter, user.id);
  if (!rateLimit.success) {
    return rateLimitedResponse(rateLimit);
  }

  const parsed = removePushSubscriptionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("user_id", user.id)
    .eq("endpoint", parsed.data.endpoint);

  if (error) {
    return NextResponse.json({ error: "Could not remove that subscription" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
