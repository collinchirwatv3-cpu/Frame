import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { uploadMetadataSchema, LONGFORM_MIN_DURATION_SECONDS } from "@/lib/validation/upload";
import { createTusUploadSession } from "@/lib/cloudflare-stream";
import { uploadRateLimiter, checkRateLimit, rateLimitedResponse } from "@/lib/rate-limit";

// 2x the $5 base advertising CPM — Promote is deliberately pricier than
// Run as an Ad, so paid reach can't disguise itself as cheap commercial
// advertising (the monetization model's own stated reasoning). No Stripe
// integration exists yet (Phase 2) — the campaigns row this creates lands
// status: "pending_payment" and can't actually be charged until then.
const PROMOTE_CPM_CENTS = 1000;

// Mints a real Cloudflare Stream direct-upload (TUS) session and creates the
// video's DB row up front, in `uploading` state — see
// supabase/migrations/20260805000000_upload_pipeline.sql for why
// playback_url/poster_url are nullable until the Stream webhook confirms
// the encode is ready. Replaces UploadDropzone.tsx's old fake setTimeout
// publish() entirely.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  // RLS (videos_insert_own, see 20260808030000_invite_gate_rls.sql) already
  // enforces this at the database layer — this is a clearer, faster-failing
  // error than letting an uninvited insert bubble up as a raw RLS violation.
  // monetization_eligible rides along in the same query (see the
  // publishMode === "monetise" check below) — it's on the same row, no
  // extra round trip.
  const { data: profile } = await supabase
    .from("profiles")
    .select("invite_redeemed_at, monetization_eligible")
    .eq("id", user.id)
    .single();
  if (!profile?.invite_redeemed_at) {
    return NextResponse.json({ error: "An invite is required" }, { status: 403 });
  }

  const rateLimit = await checkRateLimit(uploadRateLimiter, user.id);
  if (!rateLimit.success) {
    return rateLimitedResponse(rateLimit);
  }

  const parsed = uploadMetadataSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const {
    title,
    description,
    category,
    contentType,
    publishMode,
    width,
    height,
    durationSeconds,
    fileSizeBytes,
  } = parsed.data;

  // Authoritative, not client-trusted: under 3 minutes is always "short",
  // full stop — the schema's superRefine already rejects an explicit
  // longform request that's too short, but this covers every other case
  // too (e.g. a client that just sent "film" for a 90-second clip). Above
  // the threshold, the schema has already validated contentType is a real
  // choice ("film" or "longform"), so it's trusted as-is here.
  const contentTypeFinal = durationSeconds < LONGFORM_MIN_DURATION_SECONDS ? "short" : contentType;

  // Same "never trust the client for a derived boundary" posture as
  // contentTypeFinal above: the schema's superRefine only catches
  // publishMode === "monetise" against the client-claimed contentType — a
  // client could claim "film" for a 90-second video (schema sees no
  // conflict) while contentTypeFinal, re-derived from real duration, comes
  // out "short". Re-check against the authoritative value, not the claimed
  // one. videos_insert_own (20260808060000) would reject this at the RLS
  // layer regardless via the eligibility check below, but this is the same
  // "clearer, faster-failing error" reasoning as the invite check above.
  if (publishMode === "monetise" && contentTypeFinal === "short") {
    return NextResponse.json(
      { error: "Monetise is for long-form videos — Shorts earn through the creator pool instead" },
      { status: 400 }
    );
  }
  if (publishMode === "monetise" && !profile.monetization_eligible) {
    return NextResponse.json({ error: "You're not eligible to monetise videos yet" }, { status: 403 });
  }

  // Businesses can Run as an Ad but never Promote — advertising must never
  // masquerade as organic creator content, per the monetization model's
  // own explicit rule. A second query, only for this branch, since it's a
  // different table than the profile fetch above and most uploads never
  // touch it.
  if (publishMode === "promote") {
    const { data: businessChannel } = await supabase
      .from("business_channels")
      .select("status")
      .eq("profile_id", user.id)
      .maybeSingle();
    if (businessChannel?.status === "approved") {
      return NextResponse.json(
        { error: "Business Channels can Run as an Ad instead of Promote" },
        { status: 403 }
      );
    }
  }

  let session: Awaited<ReturnType<typeof createTusUploadSession>>;
  try {
    session = await createTusUploadSession(durationSeconds, fileSizeBytes);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not start the upload" },
      { status: 502 }
    );
  }

  const { data: video, error } = await supabase
    .from("videos")
    .insert({
      creator_id: user.id,
      stream_uid: session.uid,
      processing_status: "uploading",
      content_type: contentTypeFinal,
      title,
      description,
      category,
      width,
      height,
      duration_seconds: durationSeconds,
      publish_mode: publishMode,
      // Required NOT NULL columns with no real value yet — Stream's webhook
      // overwrites both the moment the encode is ready.
      playback_url: null,
      poster_url: null,
    })
    .select("id")
    .single();

  if (error || !video) {
    return NextResponse.json({ error: "Could not create the video record" }, { status: 500 });
  }

  // Same user-scoped client as the videos insert above, not service-role —
  // this genuinely exercises campaigns_insert_own's RLS check
  // (20260808080000_campaigns.sql), rather than bypassing it. A failure
  // here doesn't roll back the video itself — the video is real and
  // published either way; only the boost campaign silently didn't attach,
  // same "the upload succeeded, a secondary step didn't" tolerance this
  // route already has for the thumbnail step elsewhere in the app.
  if (publishMode === "promote") {
    const { error: campaignError } = await supabase.from("campaigns").insert({
      type: "promote",
      owner_id: user.id,
      video_id: video.id,
      cpm_cents: PROMOTE_CPM_CENTS,
      status: "pending_payment",
    });
    if (campaignError) {
      console.error(`Upload: failed to create promote campaign for video ${video.id}:`, campaignError);
    }
  }

  return NextResponse.json({ uploadUrl: session.uploadUrl, videoId: video.id });
}
