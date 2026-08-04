import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { authRateLimiter, checkRateLimit, rateLimitedResponse } from "@/lib/rate-limit";

const bodySchema = z.object({ code: z.string().trim().min(1).max(64) });

function serviceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Pre-auth check only — does this code exist and still have uses left? Never
// increments uses_count; that only happens in /api/invite/redeem once we
// know which account is actually claiming it. Public and unauthenticated by
// necessity (nobody has signed in yet at this point in the flow), so it's
// the one endpoint here worth rate-limiting hardest against code-guessing.
export async function POST(request: NextRequest) {
  const identifier = request.headers.get("x-forwarded-for") ?? "unknown";
  const rateLimit = await checkRateLimit(authRateLimiter, identifier);
  if (!rateLimit.success) {
    return rateLimitedResponse(rateLimit);
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ valid: false, error: "Enter an invite code" }, { status: 400 });
  }

  const code = parsed.data.code.toUpperCase();
  const supabase = serviceClient();
  const { data, error } = await supabase
    .from("invite_codes")
    .select("uses_count, max_uses, expires_at")
    .eq("code", code)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ valid: false, error: "Something went wrong" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ valid: false, error: "That code isn't valid" }, { status: 200 });
  }
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return NextResponse.json({ valid: false, error: "That code has expired" }, { status: 200 });
  }
  if (data.uses_count >= data.max_uses) {
    return NextResponse.json({ valid: false, error: "That code has already been used" }, { status: 200 });
  }

  return NextResponse.json({ valid: true });
}
