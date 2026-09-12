import { NextResponse, type NextRequest } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { watchSessionHeartbeatRateLimiter, checkRateLimit, rateLimitedResponse } from "@/lib/rate-limit";

const bodySchema = z.object({
  sessionId: z.string().uuid(),
  sessionToken: z.string().uuid(),
  deltaSeconds: z.number(),
  positionSeconds: z.number(),
});

function serviceClient() {
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Advances a watch session's watched_seconds/max_position_seconds. The RPC is
 * service-only; SQL remains authoritative for token validation and time bounds.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const identifier = user?.id ?? request.headers.get("x-forwarded-for") ?? "unknown";
  const rateLimit = await checkRateLimit(watchSessionHeartbeatRateLimiter, identifier);
  if (!rateLimit.success) {
    return rateLimitedResponse(rateLimit);
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { error } = await serviceClient().rpc("record_watch_heartbeat", {
    p_session_id: parsed.data.sessionId,
    p_session_token: parsed.data.sessionToken,
    p_delta_seconds: parsed.data.deltaSeconds,
    p_position_seconds: parsed.data.positionSeconds,
  });

  if (error) {
    // record_watch_heartbeat raises when session_id/session_token don't
    // match a real row together — same "invalid session" response either
    // way, not distinguishing "doesn't exist" from "wrong token" (nothing
    // useful for a legitimate client to do differently either way).
    return NextResponse.json({ error: "Invalid session" }, { status: 403 });
  }

  return NextResponse.json({ ok: true });
}
