import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { uploadMetadataSchema, LONGFORM_MIN_DURATION_SECONDS } from "@/lib/validation/upload";
import { createTusUploadSession } from "@/lib/cloudflare-stream";
import { uploadRateLimiter, checkRateLimit, rateLimitedResponse } from "@/lib/rate-limit";

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
  const { data: profile } = await supabase
    .from("profiles")
    .select("invite_redeemed_at")
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
  const { title, description, category, contentType, width, height, durationSeconds, fileSizeBytes } =
    parsed.data;

  // Authoritative, not client-trusted: under 3 minutes is always "short",
  // full stop — the schema's superRefine already rejects an explicit
  // longform request that's too short, but this covers every other case
  // too (e.g. a client that just sent "film" for a 90-second clip). Above
  // the threshold, the schema has already validated contentType is a real
  // choice ("film" or "longform"), so it's trusted as-is here.
  const contentTypeFinal = durationSeconds < LONGFORM_MIN_DURATION_SECONDS ? "short" : contentType;

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

  return NextResponse.json({ uploadUrl: session.uploadUrl, videoId: video.id });
}
