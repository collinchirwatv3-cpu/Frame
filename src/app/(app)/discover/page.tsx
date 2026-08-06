"use client";

import { useEffect, useState } from "react";
import { SwipeFeed } from "@/components/feed/SwipeFeed";
import { fetchDiscoverVideos } from "@/lib/video-fetch";
import { useEngagementStore } from "@/store/engagement-store";
import type { Video } from "@/lib/types";

/**
 * Discover: a full-screen swipe feed, no filters/search/rails chrome — the
 * counterpart to Home's For You/Saved/History mix. Public films the viewer
 * hasn't watched yet (fetchDiscoverVideos excludes anything already in
 * their watch_progress), newest first. Signed-out visitors just get recent
 * public films, since there's no watch history to exclude yet.
 */
export default function DiscoverPage() {
  const userId = useEngagementStore((s) => s.userId);
  const hydrated = useEngagementStore((s) => s.hydrated);
  const [videos, setVideos] = useState<Video[]>([]);

  useEffect(() => {
    if (!hydrated) return;
    fetchDiscoverVideos(userId).then(setVideos);
  }, [hydrated, userId]);

  return <SwipeFeed videos={videos} tabs={false} />;
}
