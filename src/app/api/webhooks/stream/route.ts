import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyStreamWebhookSignature, getStreamVideoDetails } from "@/lib/cloudflare-stream";

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
    const { error } = await supabase
      .from("videos")
      .update({
        processing_status: "ready",
        playback_url: details.playbackHlsUrl,
        poster_url: details.thumbnailUrl,
        width: details.width,
        height: details.height,
        duration_seconds: details.durationSeconds,
      })
      .eq("stream_uid", uid);

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
