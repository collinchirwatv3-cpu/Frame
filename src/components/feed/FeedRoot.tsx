"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SwipeFeed } from "./SwipeFeed";
import { TrendingGrid } from "@/components/explore/TrendingGrid";
import { useIsPortraitMobile } from "@/lib/use-portrait-mobile";
import { fetchHomeFeed } from "@/lib/home-feed";
import { useEngagementStore } from "@/store/engagement-store";
import type { Video } from "@/lib/types";

/**
 * Home's feed: For You, then Saved, then History, one continuous sequence
 * capped at 50 (see lib/home-feed.ts) — no more "For You"/"Following" tabs,
 * that split is retired in favor of this composition.
 *
 * Portrait phones get a browsable grid (same TrendingGrid Explore/Discover
 * uses) instead of the immersive swipe feed until a specific video is
 * selected — scrolling the home feed no longer requires rotating first.
 * Tapping a video sets `?v=<id>` (TrendingGrid's cards already link to
 * `/?v=<id>`), which flips this over to the real SwipeFeed. Landscape
 * phones, tablets, and desktop always get SwipeFeed directly.
 */
export function FeedRoot() {
  const isPortraitMobile = useIsPortraitMobile();
  const hasSelectedVideo = useSearchParams().has("v");
  const userId = useEngagementStore((s) => s.userId);
  const hydrated = useEngagementStore((s) => s.hydrated);
  const [videos, setVideos] = useState<Video[]>([]);

  useEffect(() => {
    if (!hydrated) return;
    fetchHomeFeed(userId).then(setVideos);
  }, [hydrated, userId]);

  if (isPortraitMobile && !hasSelectedVideo) {
    return (
      <div className="pt-8 pb-24">
        <h1 className="text-2xl font-bold px-6 mb-1">FRAMES</h1>
        <p className="text-text-secondary text-sm px-6 mb-6">
          Tap a film to watch — turn your phone sideways for the full cinematic view.
        </p>
        <TrendingGrid videos={videos} />
      </div>
    );
  }

  return <SwipeFeed videos={videos} tabs={false} />;
}
