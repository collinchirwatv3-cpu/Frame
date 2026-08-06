"use client";

import { useSearchParams } from "next/navigation";
import { SwipeFeed } from "./SwipeFeed";
import { TrendingGrid } from "@/components/explore/TrendingGrid";
import { useIsPortraitMobile } from "@/lib/use-portrait-mobile";
import type { Video } from "@/lib/types";

/**
 * Portrait phones get a browsable grid (same TrendingGrid Explore uses) —
 * scrolling the home feed no longer requires rotating first. Tapping a
 * video sets `?v=<id>` (TrendingGrid's cards already link to `/?v=<id>`),
 * which flips this over to the real SwipeFeed — landscape-only, same as
 * before, RotateDevicePrompt nudges the actual rotation once a specific
 * video is selected. Landscape phones, tablets, and desktop always get
 * SwipeFeed directly; nothing changes for them.
 */
export function FeedRoot({ videos }: { videos: Video[] }) {
  const isPortraitMobile = useIsPortraitMobile();
  const hasSelectedVideo = useSearchParams().has("v");

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

  return <SwipeFeed videos={videos} />;
}
