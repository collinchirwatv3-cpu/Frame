import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendDmMessageSchema } from "@/lib/validation/dm";
import { dmMessageRateLimiter, checkRateLimit, rateLimitedResponse } from "@/lib/rate-limit";

// Mirrors /api/comments' own shape exactly (rate limit + invite gate in
// front of the RLS-scoped write) — the RLS-scoped client, not service-role.
// dm_messages_insert_own is the real authorization boundary (participant +
// not a blocked pair, 20260917000000_direct_messages.sql); this is a thin
// gate in front of it, not a second one.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("invite_redeemed_at")
    .eq("id", user.id)
    .single();
  if (!profile?.invite_redeemed_at) {
    return NextResponse.json({ error: "An invite is required" }, { status: 403 });
  }

  const rateLimit = await checkRateLimit(dmMessageRateLimiter, user.id);
  if (!rateLimit.success) {
    return rateLimitedResponse(rateLimit);
  }

  const parsed = sendDmMessageSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { threadId, text, replyToId } = parsed.data;

  const { data, error } = await supabase
    .from("dm_messages")
    .insert({ thread_id: threadId, sender_id: user.id, text, ...(replyToId ? { reply_to_id: replyToId } : {}) })
    .select("id, thread_id, sender_id, text, created_at, reply_to_id")
    .single();

  if (error || !data) {
    // Covers both a real failure and the block/not-a-participant case —
    // dm_messages_insert_own's with-check rejects that one silently as a
    // failed insert, not a distinct error code, so this can't (and
    // shouldn't) tell the caller which. Same "don't leak the raw db error"
    // posture as every other route here.
    return NextResponse.json({ error: "Could not send that message" }, { status: 400 });
  }

  return NextResponse.json(data);
}
