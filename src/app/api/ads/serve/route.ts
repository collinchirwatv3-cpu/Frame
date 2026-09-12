import { NextResponse, type NextRequest } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { adServeRateLimiter, checkRateLimit, rateLimitedResponse } from "@/lib/rate-limit";
import { getOrCreateAnonId } from "@/lib/anon-id";

const bodySchema = z.object({
  placement: z.enum(["shorts_feed", "longform_preroll", "longform_midroll"]),
  contextVideoId: z.string().uuid(),
});

function serviceClient() {
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Selects an eligible active business_ad campaign and records an
 * impression for it — service-role throughout, same as the moderation
 * route: campaigns/ad_impressions have no client-facing read/write access
 * at all (20260808080000_campaigns.sql, 20260808100000_ad_impressions.sql),
 * by design.
 *
 * There is deliberately no ad-creative payload in the response — this
 * phase of the monetization system has no ad-creative data model (a
 * Business Channel's "Run as an Ad" campaign-creation flow itself isn't
 * built yet either; campaigns of type business_ad exist only via direct/
 * QA seeding for now, same as any campaign structurally can't reach
 * status = 'active' without Phase 2 or a manual flip). This route proves
 * the impression-recording/anti-gaming plumbing end to end; rendering an
 * actual ad unit is a real, separate, not-yet-scoped surface.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const identifier = user?.id ?? request.headers.get("x-forwarded-for") ?? "unknown";
  const rateLimit = await checkRateLimit(adServeRateLimiter, identifier);
  if (!rateLimit.success) {
    return rateLimitedResponse(rateLimit);
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const anonId = user ? null : await getOrCreateAnonId();
  const service = serviceClient();

  // An existing UUID is not enough to bill for an impression: the placement
  // must be around a public video that viewers can actually play.
  const { data: contextVideo } = await service
    .from("videos")
    .select("id")
    .eq("id", parsed.data.contextVideoId)
    .eq("visibility", "public")
    .eq("processing_status", "ready")
    .maybeSingle();
  if (!contextVideo) {
    return NextResponse.json({ ad: null });
  }

  // No real targeting yet (placement isn't matched against anything on
  // campaigns — that table has no placement/surface column in Phase 1) —
  // just the most recently activated eligible campaign. A real ad-serving
  // auction is a later concern; this is the smallest thing that lets the
  // impression/anti-gaming plumbing be exercised at all.
  const { data: campaign } = await service
    .from("campaigns")
    .select("id")
    .eq("type", "business_ad")
    .eq("status", "active")
    .order("activated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!campaign) {
    return NextResponse.json({ ad: null });
  }

  const { data: impressionId, error } = await service.rpc("record_ad_impression", {
    p_campaign_id: campaign.id,
    p_placement: parsed.data.placement,
    p_context_video_id: parsed.data.contextVideoId,
    p_viewer_id: user?.id ?? null,
    p_anon_id: anonId,
  });

  if (error) {
    // record_ad_impression raises for "not an active business_ad" (a race
    // against the select above — the campaign could have just paused) or
    // "frequency cap reached" — either way, no ad for this request.
    return NextResponse.json({ ad: null });
  }

  return NextResponse.json({ ad: { campaignId: campaign.id, impressionId } });
}
