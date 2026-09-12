import { NextResponse, type NextRequest } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { watchSessionStartRateLimiter, checkRateLimit, rateLimitedResponse } from "@/lib/rate-limit";
import { getOrCreateAnonId } from "@/lib/anon-id";

const bodySchema = z.object({
  videoId: z.string().uuid(),
  // Only trusted after being cross-checked against a real, recent
  // ad_impressions row below — never taken as a bare client claim, same
  // "client claims, server re-derives" posture as everything else in this
  // app that touches money.
  campaignId: z.string().uuid().optional(),
});

function serviceClient() {
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Starts a watch session — open to signed-out callers too, same as
 * watching itself always has been in this app (see
 * 20260808090000_watch_sessions.sql's own module comment). Every field
 * that matters downstream (viewer_id/anon_id, campaign_id) is set here
 * server-side, never taken from the client body directly.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const identifier = user?.id ?? request.headers.get("x-forwarded-for") ?? "unknown";
  const rateLimit = await checkRateLimit(watchSessionStartRateLimiter, identifier);
  if (!rateLimit.success) {
    return rateLimitedResponse(rateLimit);
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const anonId = user ? null : await getOrCreateAnonId();
  const service = serviceClient();

  // Private-link playback needs its own verified token path before it can
  // create monetization events. Only ready public videos count for now.
  const { data: video } = await service
    .from("videos")
    .select("id")
    .eq("id", parsed.data.videoId)
    .eq("visibility", "public")
    .eq("processing_status", "ready")
    .maybeSingle();
  if (!video) {
    return NextResponse.json({ error: "Video unavailable" }, { status: 404 });
  }

  // A claimed campaignId only sticks if there's a real, recent
  // shorts_feed ad_impressions row proving this exact viewer actually saw
  // that campaign's ad. ad_impressions has zero client-facing RLS access
  // (20260808100000_ad_impressions.sql) — this lookup needs the
  // service-role client, same as the moderation route's own privileged
  // reads. preroll/midroll impressions don't qualify here: those happen
  // *inside* an already-started, already-organic session, so they can't
  // retroactively make the session containing them "paid" — only a shown
  // ad that led someone TO a video can do that.
  let verifiedCampaignId: string | null = null;
  if (parsed.data.campaignId) {
    let query = service
      .from("ad_impressions")
      .select("id")
      .eq("campaign_id", parsed.data.campaignId)
      .eq("placement", "shorts_feed")
      .eq("context_video_id", parsed.data.videoId)
      .gte("served_at", new Date(Date.now() - 10 * 60 * 1000).toISOString())
      .limit(1);
    query = user ? query.eq("viewer_id", user.id) : query.eq("anon_id", anonId);
    const { data: recentImpression } = await query.maybeSingle();
    if (recentImpression) verifiedCampaignId = parsed.data.campaignId;
  }

  // Direct client INSERT is deliberately revoked. This service-role write is
  // safe because every persisted field is derived above rather than accepted
  // from the caller.
  const { data: session, error } = await service
    .from("watch_sessions")
    .insert({
      video_id: parsed.data.videoId,
      viewer_id: user?.id ?? null,
      anon_id: anonId,
      campaign_id: verifiedCampaignId,
    })
    .select("id, client_session_token")
    .single();

  if (error || !session) {
    return NextResponse.json({ error: "Could not start the watch session" }, { status: 500 });
  }

  return NextResponse.json({ sessionId: session.id, sessionToken: session.client_session_token });
}
