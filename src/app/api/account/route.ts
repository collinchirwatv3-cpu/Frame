import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { deleteStreamVideo } from "@/lib/cloudflare-stream";
import { authRateLimiter, checkRateLimit, rateLimitedResponse } from "@/lib/rate-limit";

function serviceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Permanent, self-service account deletion. No password re-auth step — this
// app has no password auth at all (Google/Apple OAuth + email magic-link
// only), so the confirmation dialog client-side is the equivalent friction.
// Deleting the auth.users row cascades through profiles to every owned row
// (videos, likes, saves, comments, follows, watch_progress, share_links,
// saved_collections — all `on delete cascade` in the schema) and revokes
// every session/refresh token as an inherent part of deleting the user —
// there's no separate "revoke sessions" step to call.
export async function DELETE() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const rateLimit = await checkRateLimit(authRateLimiter, user.id);
  if (!rateLimit.success) {
    return rateLimitedResponse(rateLimit);
  }

  const service = serviceClient();

  // Best-effort Stream cleanup — a creator's actual uploaded video assets,
  // not just the DB rows describing them. Never blocks account deletion on
  // a single video's cleanup failing; Cloudflare's own dashboard is the
  // fallback for anything left behind.
  const { data: ownVideos } = await service
    .from("videos")
    .select("stream_uid")
    .eq("creator_id", user.id)
    .not("stream_uid", "is", null);

  const cleanupFailures: string[] = [];
  for (const video of ownVideos ?? []) {
    if (!video.stream_uid) continue;
    try {
      await deleteStreamVideo(video.stream_uid);
    } catch (err) {
      cleanupFailures.push(video.stream_uid);
      console.error(`Failed to delete Stream video ${video.stream_uid}:`, err);
    }
  }

  const { error } = await service.auth.admin.deleteUser(user.id);
  if (error) {
    return NextResponse.json({ error: "Could not delete your account. Try again." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    ...(cleanupFailures.length > 0 && {
      warning: `${cleanupFailures.length} video(s) could not be removed from Cloudflare Stream and may need manual cleanup.`,
    }),
  });
}
