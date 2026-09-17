import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { uploadMetadataSchema, SHORTS_MAX_DURATION_SECONDS } from "@/lib/validation/upload";
import { createTusUploadSession, deleteStreamVideo } from "@/lib/cloudflare-stream";
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
    contentTypeTagId,
    genreTagIds,
    topicTagIds,
    moodTagIds,
    locationTagId,
    gearTagIds,
    contentType,
    publishMode,
    width,
    height,
    durationSeconds,
    fileSizeBytes,
    trimStartSeconds,
    trimEndSeconds,
  } = parsed.data;

  // Authoritative, not client-trusted: 6 minutes or less is always "short",
  // full stop — the schema's superRefine already rejects an explicit
  // longform request that's too short, but this covers every other case
  // too (e.g. a client that just sent "film" for a 90-second clip). Above
  // the threshold, the schema has already validated contentType is a real
  // choice ("film" or "longform"), so it's trusted as-is here.
  const contentTypeFinal = durationSeconds <= SHORTS_MAX_DURATION_SECONDS ? "short" : contentType === "short" ? "film" : contentType;

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

  // Video creation + direct tag writes + resolved gear/location
  // inheritance all happen inside one atomic function
  // (create_video_with_tags, 20260917150000_video_tags_atomic_write.sql)
  // — either the whole thing lands, or none of it does. Direct client
  // insert/delete on video_tags is revoked by that same migration; this
  // RPC is the only write path, and it re-validates every tag id's
  // existence/active flag/facet membership itself rather than trusting
  // this route's now-removed pre-flight check, so a raw REST call can't
  // bypass validation the way the old RLS-only policies allowed.
  const { data: videoId, error: createError } = await supabase.rpc("create_video_with_tags", {
    p_stream_uid: session.uid,
    p_content_type: contentTypeFinal,
    p_title: title,
    p_description: description,
    p_width: width,
    p_height: height,
    p_duration_seconds: durationSeconds,
    p_publish_mode: publishMode,
    p_content_type_tag_id: contentTypeTagId,
    p_genre_tag_ids: genreTagIds,
    p_topic_tag_ids: topicTagIds,
    p_mood_tag_ids: moodTagIds,
    p_location_tag_id: locationTagId,
    p_gear_tag_ids: gearTagIds,
    p_trim_start_seconds: trimStartSeconds,
    p_trim_end_seconds: trimEndSeconds ?? null,
  });

  if (createError || !videoId) {
    // The Stream session (and its associated storage) was already minted
    // above — since the DB write failed atomically, nothing references
    // that session, so it's cleaned up rather than left as an orphaned
    // upload target. A cleanup failure is logged (never the auth token —
    // deleteStreamVideo's own error message only ever includes the uid
    // and HTTP status) but doesn't change the response: the upload has
    // already failed regardless of whether cleanup succeeds.
    try {
      await deleteStreamVideo(session.uid);
    } catch (cleanupErr) {
      console.error(
        `Upload: failed to clean up orphaned Stream session ${session.uid} after a failed create_video_with_tags call:`,
        cleanupErr instanceof Error ? cleanupErr.message : cleanupErr
      );
    }
    return NextResponse.json(
      { error: createError?.message || "Could not create the video record" },
      { status: 400 }
    );
  }

  const video = { id: videoId as string };

  // Same user-scoped client as the RPC call above, not service-role —
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
