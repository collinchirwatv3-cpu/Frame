import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyStreamWebhookSignature, getStreamVideoDetails } from "@/lib/cloudflare-stream";
import { SHORTS_MAX_DURATION_SECONDS } from "@/lib/validation/upload";

// Cloudflare Stream calls this once a video finishes encoding (or fails).
// No user session exists on a webhook request — this uses the service-role
// key deliberately, bypassing RLS, the same way the DB migration's
// on_*_change triggers do. Register this endpoint once via
// scripts/register-stream-webhook.mjs after deploying it.
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const secret = process.env.CLOUDFLARE_STREAM_WEBHOOK_SECRET;

  if (!secret) {
    // Fail closed — an unconfigured secret must never be treated as "no
    // verification needed."
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const signatureHeader = request.headers.get("Webhook-Signature");
  if (!verifyStreamWebhookSignature(rawBody, signatureHeader, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let uid: string;
  try {
    const body = JSON.parse(rawBody) as { uid?: string };
    if (!body.uid) throw new Error("missing uid");
    uid = body.uid;
  } catch {
    return NextResponse.json({ error: "Malformed payload" }, { status: 400 });
  }

  // The webhook body itself is treated as a "something changed" signal, not
  // the source of truth — a follow-up GET against Stream's API is the
  // canonical record of whether the video is actually ready, matching how
  // createTusUploadSession self-verifies rather than trusting parsed data.
  const details = await getStreamVideoDetails(uid);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  if (details.readyToStream && details.playbackHlsUrl) {
    // Trim bounds were set at insert time against the CLIENT-PROBED
    // duration (src/app/api/uploads/route.ts) — almost always accurate,
    // but Cloudflare's own measured duration is the authoritative one, same
    // reasoning as isActuallyShort below. A player seeking past the real
    // media duration just clamps harmlessly (see src/lib/video-trim.ts), so
    // this only needs to guard the one case that isn't harmless: a stored
    // trim_start_seconds at or past the real duration, which would make a
    // video permanently unplayable rather than just imprecisely trimmed.
    //
    // poster_url is read here too: UploadDropzone.tsx submits a client-
    // captured cover frame to /api/uploads/thumbnail right after minting
    // the video (fire-and-forget, alongside the main TUS upload — see
    // publish()), well before Stream finishes encoding in virtually every
    // real case. Without this check, this webhook would unconditionally
    // overwrite that creator-chosen cover with Cloudflare's own generic
    // auto-thumbnail the moment encoding finishes.
    const { data: existing } = await supabase
      .from("videos")
      .select("trim_start_seconds, trim_end_seconds, poster_url")
      .eq("stream_uid", uid)
      .maybeSingle();
    // /api/uploads/route.ts derives content_type/publish_mode from the
    // CLIENT-PROBED duration at insert time — real for a genuine upload,
    // but a hand-crafted request can claim any durationSeconds it likes
    // (e.g. 200s, to pass the monetise-requires-long-form check) and then
    // upload an actually-short file to the resulting Stream session.
    // Cloudflare's own measured duration, delivered here, is the first
    // point this can be caught: a video that's actually under the
    // longform threshold is forced to short/post regardless of what it
    // was inserted as, closing the monetised-short bypass. Only narrows
    // (short+post are always safe to downgrade to); a genuinely long
    // video's existing film/longform/monetise choice is left untouched —
    // that distinction is a creator choice, not a security boundary.
    const isActuallyShort =
      details.durationSeconds !== null && details.durationSeconds <= SHORTS_MAX_DURATION_SECONDS;

    const update: Record<string, unknown> = {
      processing_status: "ready",
      playback_url: details.playbackHlsUrl,
      width: details.width,
      height: details.height,
      duration_seconds: details.durationSeconds,
    };
    if (!existing?.poster_url) {
      update.poster_url = details.thumbnailUrl;
    }
    if (isActuallyShort) {
      update.content_type = "short";
      update.publish_mode = "post";
    }
    if (
      existing &&
      details.durationSeconds !== null &&
      existing.trim_start_seconds >= details.durationSeconds
    ) {
      update.trim_start_seconds = 0;
      update.trim_end_seconds = null;
    }

    const { error } = await supabase.from("videos").update(update).eq("stream_uid", uid);

    if (error) {
      return NextResponse.json({ error: "Could not update video record" }, { status: 500 });
    }
  } else if (details.state === "error") {
    await supabase.from("videos").update({ processing_status: "failed" }).eq("stream_uid", uid);
  } else {
    await supabase.from("videos").update({ processing_status: "processing" }).eq("stream_uid", uid);
  }

  return NextResponse.json({ ok: true });
}
