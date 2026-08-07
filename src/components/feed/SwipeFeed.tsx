"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { VideoCard, type VideoCardHandle } from "./VideoCard";
import { VideoPlaceholder } from "./VideoPlaceholder";
import { FeedTabs, type FeedTab } from "./FeedTabs";
import { RotateDevicePrompt } from "./RotateDevicePrompt";

// How many cards stay fully mounted on either side of the active one. Real
// <video> elements, Framer Motion instances, and sheet components are not
// free — at a real catalog size (thousands of videos in a session, not 5),
// mounting every card in the DOM at once is a genuine memory/perf problem.
// Cards outside the window render as a lightweight VideoPlaceholder instead.
const RENDER_WINDOW = 2;
// How long chrome (nav, action rail, creator info) stays visible before
// Director Mode auto-engages — long enough to read the title/creator, short
// enough that the feed reads as cinematic rather than app-chrome-heavy.
const AUTO_DIRECTOR_MODE_DELAY_MS = 2500;
import { usePlayerStore } from "@/store/player-store";
import type { Video } from "@/lib/types";

type TabsConfig = { active: FeedTab; onChange: (tab: FeedTab) => void };

/** Same copy across every empty forYou/untabbed case, deliberately —
 * e2e/feed-engagement.spec.ts asserts this exact string for Home. Exported
 * so FeedRoot's portrait-grid layout can reuse the same per-tab messaging
 * around TrendingGrid instead of duplicating it. */
export function EmptyState({ tab }: { tab: FeedTab | null }) {
  if (tab === null || tab === "forYou") {
    return (
      <>
        <p className="text-lg font-semibold">No videos yet</p>
        <p className="text-sm text-text-secondary max-w-xs">
          FRAMES is just getting started — be the first to upload something worth watching.
        </p>
        <Link
          href="/upload"
          className="mt-2 px-5 py-2.5 rounded-full bg-primary text-bg text-sm font-semibold"
        >
          Upload a video
        </Link>
      </>
    );
  }
  if (tab === "following") {
    return (
      <>
        <p className="text-lg font-semibold">Follow creators to see them here</p>
        <p className="text-sm text-text-secondary max-w-xs">
          Videos from creators you follow will show up in this tab.
        </p>
        <Link
          href="/discover"
          className="mt-2 px-5 py-2.5 rounded-full bg-primary text-bg text-sm font-semibold"
        >
          Find creators to follow
        </Link>
      </>
    );
  }
  if (tab === "saved") {
    return (
      <>
        <p className="text-lg font-semibold">Nothing saved yet</p>
        <p className="text-sm text-text-secondary max-w-xs">
          Save a video from the feed and it&apos;ll show up here.
        </p>
      </>
    );
  }
  return (
    <>
      <p className="text-lg font-semibold">No watch history yet</p>
      <p className="text-sm text-text-secondary max-w-xs">Videos you watch will show up here.</p>
    </>
  );
}

export function SwipeFeed({ videos, tabsConfig }: { videos: Video[]; tabsConfig?: TabsConfig }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const cardRefs = useRef<(VideoCardHandle | null)[]>([]);
  const toggleMuted = usePlayerStore((s) => s.toggleMuted);
  const directorMode = usePlayerStore((s) => s.directorMode);
  const isScrubbing = usePlayerStore((s) => s.isScrubbing);
  const enterDirectorMode = usePlayerStore((s) => s.enterDirectorMode);
  const exitDirectorMode = usePlayerStore((s) => s.exitDirectorMode);

  // Director Mode is a feed-only experience — never let it leak into other routes.
  useEffect(() => {
    return () => exitDirectorMode();
  }, [exitDirectorMode]);

  const searchParams = useSearchParams();
  const initialIndex = useMemo(() => {
    const targetId = searchParams.get("v");
    if (!targetId) return 0;
    const idx = videos.findIndex((v) => v.id === targetId);
    return idx >= 0 ? idx : 0;
  }, [searchParams, videos]);

  const [activeIndex, setActiveIndex] = useState(initialIndex);

  // Jump straight to the deep-linked video before paint — no flash of video 0.
  useLayoutEffect(() => {
    const container = containerRef.current;
    const target = sectionRefs.current[initialIndex];
    if (container && target && initialIndex > 0) {
      container.scrollTop = target.offsetTop;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switching feed tabs starts a fresh list — reset scroll position and
  // trim stale refs from the previous (possibly longer) list. Keyed off the
  // active tab itself (a prop now, the parent owns tab state and fetches
  // per-tab) rather than anything local — for untabbed callers this prop is
  // always undefined, so the effect never re-fires after mount for them.
  const isFirstTabRender = useRef(true);
  useEffect(() => {
    if (isFirstTabRender.current) {
      isFirstTabRender.current = false;
      return;
    }
    sectionRefs.current.length = videos.length;
    cardRefs.current.length = videos.length;
    setActiveIndex(0);
    const container = containerRef.current;
    if (container) container.scrollTop = 0;
  }, [tabsConfig?.active, videos.length]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const index = Number((entry.target as HTMLElement).dataset.index);
            setActiveIndex(index);
          }
        }
      },
      { root: container, threshold: 0.6 }
    );

    sectionRefs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [videos.length, tabsConfig?.active]);

  // Scrolling to a new scene always brings chrome back — never let someone
  // land on a video with the nav/action rail already hidden.
  useEffect(() => {
    exitDirectorMode();
  }, [activeIndex, exitDirectorMode]);

  // Auto-engage Director Mode after a beat so the feed defaults to
  // cinematic, chrome-free viewing rather than requiring an explicit tap.
  // Never while scrubbing (chrome fading mid-drag would yank the scrub bar
  // out from under the user's finger) or with nothing playing — no point
  // hiding the nav over an empty state.
  useEffect(() => {
    if (directorMode || isScrubbing || videos.length === 0) return;
    const timer = window.setTimeout(enterDirectorMode, AUTO_DIRECTOR_MODE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [activeIndex, directorMode, isScrubbing, videos.length, enterDirectorMode]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const container = containerRef.current;
      if (!container) return;

      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        container.scrollBy({ top: container.clientHeight, behavior: "smooth" });
      } else if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        container.scrollBy({ top: -container.clientHeight, behavior: "smooth" });
      } else if (e.key === "m") {
        toggleMuted();
      } else if (e.key === " ") {
        e.preventDefault();
        cardRefs.current[activeIndex]?.togglePlay();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleMuted, activeIndex]);

  return (
    <div className="relative h-dvh w-full">
      <RotateDevicePrompt />
      {tabsConfig && <FeedTabs active={tabsConfig.active} onChange={tabsConfig.onChange} />}

      {videos.length === 0 ? (
        <div className="h-dvh w-full flex flex-col items-center justify-center gap-3 text-center px-6">
          <EmptyState tab={tabsConfig?.active ?? null} />
        </div>
      ) : (
        <div
          ref={containerRef}
          className="h-dvh w-full overflow-y-scroll snap-y snap-mandatory no-scrollbar"
        >
          {videos.map((video, index) => {
            const withinRenderWindow = Math.abs(index - activeIndex) <= RENDER_WINDOW;

            if (!withinRenderWindow) {
              return (
                <VideoPlaceholder
                  key={video.id}
                  video={video}
                  index={index}
                  ref={(el) => {
                    sectionRefs.current[index] = el as HTMLDivElement | null;
                    cardRefs.current[index] = null;
                  }}
                />
              );
            }

            return (
              <VideoCard
                key={video.id}
                ref={(handle) => {
                  cardRefs.current[index] = handle;
                }}
                video={video}
                index={index}
                active={index === activeIndex}
                sectionRef={(el) => {
                  sectionRefs.current[index] = el as HTMLDivElement | null;
                }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
