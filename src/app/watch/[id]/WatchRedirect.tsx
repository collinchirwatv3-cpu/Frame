"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { SwipeFeed } from "@/components/feed/SwipeFeed";
import { fetchVideoById } from "@/lib/video-fetch";
import type { Video } from "@/lib/types";

/**
 * Was router.replace(`/?v=${videoId}`) — reasonable when Home rendered
 * every public video, broken now that Home is a curated 50-item For
 * You/Saved/History composition (lib/home-feed.ts): a shared link almost
 * never happens to already be in the visitor's own curated feed, so the
 * redirect would silently land on an unrelated video (whatever's first in
 * their feed) instead of the one they followed the link to watch. Renders
 * the video directly instead — same "scope SwipeFeed to just this result"
 * pattern already used for search and profile-viewing.
 */
export function WatchRedirect({ videoId }: { videoId: string }) {
  const [video, setVideo] = useState<Video | null | undefined>(undefined);

  useEffect(() => {
    fetchVideoById(videoId).then(setVideo);
  }, [videoId]);

  if (video === undefined) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <Loader2 size={28} className="animate-spin text-text-secondary" />
      </div>
    );
  }

  if (video === null) {
    return (
      <div className="min-h-dvh flex items-center justify-center text-sm text-text-secondary">
        This video isn&apos;t available anymore.
      </div>
    );
  }

  return <SwipeFeed videos={[video]} />;
}
