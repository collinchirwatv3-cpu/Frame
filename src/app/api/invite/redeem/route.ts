import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { authRateLimiter, checkRateLimit, rateLimitedResponse } from "@/lib/rate-limit";

const bodySchema = z.object({ code: z.string().trim().min(1).max(64) });

function serviceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// The authoritative consume — called once, right after first login, with
// whichever code InviteGate validated pre-auth. Re-validates from scratch
// server-side rather than trusting the earlier /validate call (that call
// only proved the code was usable at that moment, not that it still is).
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const rateLimit = await checkRateLimit(authRateLimiter, user.id);
  if (!rateLimit.success) {
    return rateLimitedResponse(rateLimit);
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter an invite code" }, { status: 400 });
  }
  const code = parsed.data.code.toUpperCase();

  const service = serviceClient();

  // Already redeemed (e.g. a second tab racing the first) — treat as
  // success rather than erroring, so the client doesn't need to special-case it.
  const { data: profile } = await service
    .from("profiles")
    .select("invite_redeemed_at")
    .eq("id", user.id)
    .single();
  if (profile?.invite_redeemed_at) {
    return NextResponse.json({ ok: true });
  }

  const { data: redeemed, error: redeemError } = await service.rpc("redeem_invite_code", {
    p_code: code,
  });
  if (redeemError) {
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
  if (!redeemed) {
    return NextResponse.json({ error: "That code isn't valid or has already been used" }, { status: 400 });
  }

  const { error: updateError } = await service
    .from("profiles")
    .update({ invite_redeemed_at: new Date().toISOString() })
    .eq("id", user.id);
  if (updateError) {
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
