import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { uploadThumbnail } from "@/lib/r2";
import { uploadRateLimiter, checkRateLimit, rateLimitedResponse } from "@/lib/rate-limit";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const frameSchema = z.object({
  videoId: z.string().uuid(),
  timeSeconds: z.number().min(0),
});

function serviceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Sets a video's poster_url two ways: (1) a specific frame from the source
 * video, built server-side from Cloudflare Stream's own thumbnail endpoint
 * (`?time=`) — nothing the client sends is trusted as a URL, only a
 * timestamp number, clamped to the video's real duration; or (2) an
 * uploaded/composited image (crop + optional text overlay, rasterized
 * client-side onto a canvas), stored in R2.
 *
 * `videos` has had table-level UPDATE fully revoked from `authenticated`
 * since 20260806130000_lock_down_videos_update.sql (RC1 security audit) —
 * deliberately not re-granting a poster_url column here. Ownership is
 * checked by reading the row through the normal RLS-scoped client (which
 * already limits `select` on a non-public video to its own creator — see
 * videos_select_public), and the actual write goes through the service-role
 * client, matching every other creator-scoped mutation in this codebase
 * (account deletion, invite redemption).
 */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  // Same check as /api/uploads (see 20260808030000_invite_gate_rls.sql) —
  // an uninvited user can't own a video to begin with (videos_insert_own
  // already blocks that upstream), but this gives a clearer error than the
  // generic "Video not found" that'd otherwise result from an empty select.
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

  const contentType = request.headers.get("content-type") ?? "";
  const isImageUpload = contentType.startsWith("multipart/form-data");

  if (isImageUpload) {
    const form = await request.formData().catch(() => null);
    if (!form) {
      return NextResponse.json({ error: "Malformed upload" }, { status: 400 });
    }

    const id = form.get("videoId");
    const image = form.get("image");
    if (typeof id !== "string" || !z.string().uuid().safeParse(id).success) {
      return NextResponse.json({ error: "Invalid video" }, { status: 400 });
    }
    if (!(image instanceof File)) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }
    if (!ALLOWED_IMAGE_TYPES.has(image.type)) {
      return NextResponse.json({ error: "Unsupported image type" }, { status: 400 });
    }
    if (image.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "Image is too large" }, { status: 400 });
    }

    const { data: video } = await supabase
      .from("videos")
      .select("id")
      .eq("id", id)
      .eq("creator_id", user.id)
      .maybeSingle();
    if (!video) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    let posterUrl: string;
    try {
      const bytes = new Uint8Array(await image.arrayBuffer());
      posterUrl = await uploadThumbnail(id, bytes, image.type);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Could not upload the thumbnail" },
        { status: 502 }
      );
    }

    const { error } = await serviceClient().from("videos").update({ poster_url: posterUrl }).eq("id", id);
    if (error) {
      return NextResponse.json({ error: "Could not save the thumbnail" }, { status: 500 });
    }

    return NextResponse.json({ posterUrl });
  }

  const parsed = frameSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { data: video } = await supabase
    .from("videos")
    .select("id, poster_url, duration_seconds")
    .eq("id", parsed.data.videoId)
    .eq("creator_id", user.id)
    .maybeSingle();

  if (!video || !video.poster_url) {
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  }

  const clampedTime = Math.max(
    0,
    Math.min(parsed.data.timeSeconds, video.duration_seconds ?? parsed.data.timeSeconds)
  );

  const frameUrl = new URL(video.poster_url);
  frameUrl.searchParams.set("time", `${clampedTime.toFixed(2)}s`);
  frameUrl.searchParams.set("height", "720");
  const posterUrl = frameUrl.toString();

  const { error } = await serviceClient()
    .from("videos")
    .update({ poster_url: posterUrl })
    .eq("id", video.id);
  if (error) {
    return NextResponse.json({ error: "Could not save the thumbnail" }, { status: 500 });
  }

  return NextResponse.json({ posterUrl });
}
