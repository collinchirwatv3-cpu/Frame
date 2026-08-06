import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { deleteStreamVideo } from "@/lib/cloudflare-stream";
import { moderationRateLimiter, checkRateLimit, rateLimitedResponse } from "@/lib/rate-limit";

const bodySchema = z.object({
  action: z.enum(["dismiss", "remove_video", "ban_creator"]),
});

function serviceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Acts on a report from the moderation dashboard. Every action is server-
 * side and re-checks `is_moderator` itself — never trust the client just
 * because it rendered the dashboard UI, same reasoning as every other
 * privileged mutation in this codebase (account deletion, invite redeem).
 *
 * `remove_video` and `ban_creator` both need the service-role client:
 * videos has had table-level UPDATE/DELETE-via-non-owner unreachable by any
 * `authenticated` grant since the RC1 security pass (moderators aren't the
 * video's creator, so videos_delete_own's RLS wouldn't apply to them even
 * if the grant existed), and deleting another user's auth.users row is an
 * admin API call regardless of role.
 *
 * "Ban" reuses the same account-deletion path a user would self-serve
 * (auth.admin.deleteUser) rather than introducing a separate suspension
 * flag — there's no "banned but account intact" state anywhere else in
 * this schema, and adding one would mean threading it through every RLS
 * policy that currently only checks visibility/ownership. Blunter than a
 * real trust & safety suspension tool, but honest about what it actually
 * does, and consistent with what already exists.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  if (!z.string().uuid().safeParse(reportId).success) {
    return NextResponse.json({ error: "Invalid report" }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const { data: moderator } = await supabase
    .from("profiles")
    .select("is_moderator")
    .eq("id", user.id)
    .single();
  if (!moderator?.is_moderator) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const rateLimit = await checkRateLimit(moderationRateLimiter, user.id);
  if (!rateLimit.success) {
    return rateLimitedResponse(rateLimit);
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const service = serviceClient();

  const { data: report } = await service
    .from("reports")
    .select("id, video_id, status")
    .eq("id", reportId)
    .maybeSingle();
  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  if (parsed.data.action === "dismiss") {
    const { error } = await service
      .from("reports")
      .update({ status: "dismissed", reviewed_at: new Date().toISOString() })
      .eq("id", reportId);
    if (error) return NextResponse.json({ error: "Could not dismiss the report" }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const { data: video } = await service
    .from("videos")
    .select("id, creator_id, stream_uid")
    .eq("id", report.video_id)
    .maybeSingle();
  if (!video) {
    // The video is already gone (e.g. actioned from another tab) — the
    // report itself would have cascade-deleted with it, but guard anyway.
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  }

  if (parsed.data.action === "remove_video") {
    if (video.stream_uid) {
      try {
        await deleteStreamVideo(video.stream_uid);
      } catch (err) {
        console.error(`Moderation: failed to delete Stream asset ${video.stream_uid}:`, err);
      }
    }
    const { error } = await service.from("videos").delete().eq("id", video.id);
    if (error) return NextResponse.json({ error: "Could not remove the video" }, { status: 500 });
    // The delete cascades this report away too — nothing left to mark actioned.
    return NextResponse.json({ ok: true });
  }

  // ban_creator
  const { data: ownVideos } = await service
    .from("videos")
    .select("stream_uid")
    .eq("creator_id", video.creator_id)
    .not("stream_uid", "is", null);
  for (const v of ownVideos ?? []) {
    if (!v.stream_uid) continue;
    try {
      await deleteStreamVideo(v.stream_uid);
    } catch (err) {
      console.error(`Moderation: failed to delete Stream asset ${v.stream_uid}:`, err);
    }
  }
  const { error } = await service.auth.admin.deleteUser(video.creator_id);
  if (error) return NextResponse.json({ error: "Could not ban this creator" }, { status: 500 });
  // Cascades through profiles -> videos -> reports, same as self-service
  // account deletion — nothing left to mark actioned.
  return NextResponse.json({ ok: true });
}
