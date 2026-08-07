"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SwipeFeed, EmptyState } from "./SwipeFeed";
import { TABS, type FeedTab } from "./FeedTabs";
import { TrendingGrid } from "@/components/explore/TrendingGrid";
import { useIsMobile } from "@/lib/use-portrait-mobile";
import {
  fetchPublicVideos,
  fetchFollowingVideos,
  fetchSavedVideos,
  fetchHistoryVideos,
} from "@/lib/video-fetch";
import { useEngagementStore } from "@/store/engagement-store";
import { cn } from "@/lib/utils";
import type { Video } from "@/lib/types";

const CAP = 30;

function fetchForTab(tab: FeedTab, userId: string | null): Promise<Video[]> {
  if (tab === "forYou") return fetchPublicVideos(CAP);
  if (!userId) return Promise.resolve([]);
  if (tab === "following") return fetchFollowingVideos(userId, CAP);
  if (tab === "saved") return fetchSavedVideos(userId, CAP);
  return fetchHistoryVideos(userId, CAP);
}

/**
 * Home: four real tabs (For You / Following / Saved / History), each its
 * own fetch — replaces the earlier one-continuous-composed-feed version
 * (lib/home-feed.ts, deleted). Signed-out visitors never see the tab
 * switcher at all — Following/Saved/History are inherently per-account, so
 * there's nothing useful behind them; they get For You only.
 *
 * Phones get a browsable tile grid (TrendingGrid, same one Discover uses)
 * instead of the immersive swipe feed until a specific video is selected —
 * regardless of orientation, on purpose (see useIsMobile) — the tab
 * switcher is reproduced above it as plain pill buttons rather than reusing
 * FeedTabs (that component's drop-shadow/overlay styling is built for
 * sitting on top of video content, not a plain grid background). Tablets
 * and desktop always get SwipeFeed directly, tabs and all.
 */
export function FeedRoot() {
  const isMobile = useIsMobile();
  const hasSelectedVideo = useSearchParams().has("v");
  const userId = useEngagementStore((s) => s.userId);
  const hydrated = useEngagementStore((s) => s.hydrated);
  const [tab, setTab] = useState<FeedTab>("forYou");
  const [videos, setVideos] = useState<Video[]>([]);

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    fetchForTab(tab, userId).then((result) => {
      if (!cancelled) setVideos(result);
    });
    return () => {
      cancelled = true;
    };
  }, [hydrated, userId, tab]);

  if (isMobile && !hasSelectedVideo) {
    return (
      <div className="pt-8 pb-24">
        <h1 className="text-2xl font-bold px-6 mb-1">FRAMES</h1>
        <p className="text-text-secondary text-sm px-6 mb-4">Tap a film to watch.</p>
        {userId && (
          <div className="flex items-center gap-1.5 px-6 mb-4 overflow-x-auto no-scrollbar">
            {TABS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                aria-pressed={tab === id}
                className={cn(
                  "flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors",
                  tab === id ? "bg-primary text-bg" : "text-text-secondary hover:text-accent"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <TrendingGrid
          videos={videos}
          emptyState={
            <div className="flex flex-col items-center gap-3 text-center px-6 py-16">
              <EmptyState tab={userId ? tab : "forYou"} />
            </div>
          }
        />
      </div>
    );
  }

  return (
    <SwipeFeed videos={videos} tabsConfig={userId ? { active: tab, onChange: setTab } : undefined} />
  );
}
