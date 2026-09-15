import { createClient } from "@/lib/supabase/client";

/** Records a real view once a viewer has watched past the same >3s
 * threshold VideoCard/ShortsFeed already use for watch_progress history —
 * reusing that existing threshold rather than inventing a second number.
 * Fire-and-forget, matching watch_progress's own upsert pattern: the
 * record_video_view RPC is the actual source of truth (insert-once per
 * (video, viewer) via a unique constraint), so repeat calls for an
 * already-watched video are cheap no-ops server-side — no client-side
 * dedup needed. Silently no-ops for signed-out viewers too (the RPC
 * requires auth) — /watch/[id] and /s/[token]'s anonymous browsing doesn't
 * count toward view_count, a known, documented limit, not a bug. */
export function recordVideoView(videoId: string) {
  const supabase = createClient();
  supabase.rpc("record_video_view", { p_video_id: videoId }).then(
    () => {},
    () => {}
  );
}
