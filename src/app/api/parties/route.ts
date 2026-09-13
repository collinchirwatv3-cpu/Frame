import { NextResponse, type NextRequest } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createPartySchema } from "@/lib/validation/party";
import { partyCreateRateLimiter, checkRateLimit, rateLimitedResponse } from "@/lib/rate-limit";

// Party CREATION only, not general party management (title/video/visibility
// edits and deletes still go through watch_parties_update_own/delete_own
// directly — see supabase/migrations/20260914120000_lock_down_watch_party_creation.sql
// for why only insert needed to move behind a route). Every scheduled party
// is a future notification fan-out to every follower of the host
// (notify-scheduled cron); without server-side validation and rate
// limiting, a scripted flood of creations — each scheduled_at set to "now"
// — turns into a scripted flood of follower spam the moment the cron runs.
// A per-host cap on outstanding scheduled parties closes the other half of
// that same abuse shape (a handful of accounts each queuing up hundreds of
// immediately-due parties before the rate limit window even matters).
const MAX_SCHEDULED_PARTIES_PER_HOST = 20;

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

  const rateLimit = await checkRateLimit(partyCreateRateLimiter, user.id);
  if (!rateLimit.success) {
    return rateLimitedResponse(rateLimit);
  }

  const parsed = createPartySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { title, videoId, visibility, scheduledAt, repeatRule } = parsed.data;

  if (scheduledAt) {
    const { count } = await supabase
      .from("watch_parties")
      .select("id", { count: "exact", head: true })
      .eq("host_id", user.id)
      .not("scheduled_at", "is", null);
    if ((count ?? 0) >= MAX_SCHEDULED_PARTIES_PER_HOST) {
      return NextResponse.json(
        { error: `You can have at most ${MAX_SCHEDULED_PARTIES_PER_HOST} scheduled parties at once` },
        { status: 429 }
      );
    }
  }

  // Ownership of video_id is deliberately NOT re-checked here — unlike
  // uploads/campaigns, a party has always been able to point at any real
  // video regardless of who owns it (that's the entire "watch together"
  // premise), and watch_parties never had a video-ownership constraint.
  //
  // Inserting via the service-role client, not the user-scoped one:
  // watch_parties' INSERT grant is now revoked for authenticated/anon (this
  // route is the only path), so a user-scoped insert would just fail —
  // host_id is set from the verified session user, never trusted from the
  // request body, so this doesn't reopen the "insert as anyone" hole the
  // revoke was closing.
  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const { data: party, error } = await service
    .from("watch_parties")
    .insert({
      title,
      video_id: videoId,
      host_id: user.id,
      visibility,
      scheduled_at: scheduledAt,
      repeat_rule: repeatRule,
    })
    .select("id")
    .single();

  if (error || !party) {
    return NextResponse.json({ error: "Could not create the party" }, { status: 500 });
  }

  return NextResponse.json({ id: party.id });
}
