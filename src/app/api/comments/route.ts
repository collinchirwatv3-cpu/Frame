import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createCommentSchema } from "@/lib/validation/comment";
import { commentRateLimiter, checkRateLimit, rateLimitedResponse } from "@/lib/rate-limit";

// Replaces comments-store.ts's old direct browser insert — comments were
// the one write in the likes/saves/follows/comments family never behind a
// rate-limited route (see /api/engagement/[kind]/route.ts for the others).
// Still uses the RLS-scoped client, not service-role — this is a thin
// rate-limit + clearer-error gate in front of the exact same
// comments_insert_own-governed write the client used to make directly, not
// a new authorization layer (comments_insert_own itself, tightened in
// 20260914140000_restore_private_video_interaction_boundaries.sql, remains
// the actual authorization boundary).
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("invite_redeemed_at")
    .eq("id", user.id)
    .single();
  if (!profile?.invite_redeemed_at) {
    return NextResponse.json({ error: "An invite is required" }, { status: 403 });
  }

  const rateLimit = await checkRateLimit(commentRateLimiter, user.id);
  if (!rateLimit.success) {
    return rateLimitedResponse(rateLimit);
  }

  const parsed = createCommentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { videoId, text, parentId } = parsed.data;

  const { data, error } = await supabase
    .from("comments")
    .insert({ video_id: videoId, user_id: user.id, text, parent_id: parentId })
    .select("id, text, created_at, parent_id, user:profiles(username, avatar_url)")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Could not post that comment" }, { status: 400 });
  }

  return NextResponse.json(data);
}
