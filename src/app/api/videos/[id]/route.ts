import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { editVideoSchema } from "@/lib/validation/video";
import { videoManageRateLimiter, checkRateLimit, rateLimitedResponse } from "@/lib/rate-limit";
import { deleteStreamVideo } from "@/lib/cloudflare-stream";

// Edits title/description on the caller's own video. Ownership is derived
// entirely from RLS (videos_update_own: creator_id = auth.uid()) via the
// RLS-scoped client below, never from anything in the request — a video id
// that doesn't belong to the caller (or doesn't exist) simply matches zero
// rows, which this reports as 404 rather than leaking whether the id is
// real. The database's own column-level grant (title, description only —
// 20260919100000_video_self_edit.sql) is the real boundary against writing
// anything else, same defense-in-depth posture as this route's own
// validation.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const rateLimit = await checkRateLimit(videoManageRateLimiter, user.id);
  if (!rateLimit.success) {
    return rateLimitedResponse(rateLimit);
  }

  const parsed = editVideoSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("videos")
    .update({ title: parsed.data.title, description: parsed.data.description })
    .eq("id", id)
    .select("id, title, description")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Could not update that Frame" }, { status: 400 });
  }
  if (!data) {
    return NextResponse.json({ error: "Frame not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}

// Deletes the caller's own video. The DB row (and everything cascading
// from it — likes/comments/saves/clips/tags/watch history/notifications)
// goes first; the actual Cloudflare Stream asset is cleaned up after, best-
// effort, same posture as /api/account's own account-deletion cleanup —
// a Stream failure here must never leave the row un-deleted (the row is
// this app's source of truth for what the video "is"; a leftover Stream
// asset is just wasted storage, not a broken app state).
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const rateLimit = await checkRateLimit(videoManageRateLimiter, user.id);
  if (!rateLimit.success) {
    return rateLimitedResponse(rateLimit);
  }

  const { data, error } = await supabase.from("videos").delete().eq("id", id).select("stream_uid").maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Could not delete that Frame" }, { status: 400 });
  }
  if (!data) {
    return NextResponse.json({ error: "Frame not found" }, { status: 404 });
  }

  let cleanupFailed = false;
  if (data.stream_uid) {
    try {
      await deleteStreamVideo(data.stream_uid);
    } catch (err) {
      cleanupFailed = true;
      console.error(`Failed to delete Stream video ${data.stream_uid}:`, err);
    }
  }

  return NextResponse.json({
    ok: true,
    ...(cleanupFailed && { warning: "The video file may take longer to fully remove." }),
  });
}
