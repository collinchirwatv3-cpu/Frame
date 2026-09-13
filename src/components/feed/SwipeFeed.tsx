"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { VideoCard, type VideoCardHandle } from "./VideoCard";
import { VideoPlaceholder } from "./VideoPlaceholder";
import { RotateDevicePrompt } from "./RotateDevicePrompt";
import { CHROME_FADE_TRANSITION } from "@/lib/motion";

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
// How long the one-time "tap to show controls" hint stays visible once
// Director Mode first engages, before fading itself out.
const DIRECTOR_MODE_HINT_DURATION_MS = 2200;
import { usePlayerStore } from "@/store/player-store";
import type { Video } from "@/lib/types";

const DIRECTOR_MODE_HINT_STORAGE_KEY = "frame-director-mode-hint-seen";

/** Real errors here (storage disabled, private browsing) mean "assume
 * already seen" — the hint is a nicety, never worth a crash or a console
 * error over, and defaulting to "seen" is the safe direction (skipping a
 * hint is harmless; showing it every single time would be the annoying
 * failure mode). */
function hasSeenDirectorModeHint(): boolean {
  try {
    return window.localStorage.getItem(DIRECTOR_MODE_HINT_STORAGE_KEY) === "1";
  } catch {
    return true;
  }
}

function markDirectorModeHintSeen() {
  try {
    window.localStorage.setItem(DIRECTOR_MODE_HINT_STORAGE_KEY, "1");
  } catch {
    // ignore — see hasSeenDirectorModeHint's reasoning
  }
}

/** e2e/feed-engagement.spec.ts asserts this exact string — exported so
 * FeedRoot can reuse the identical copy for its own page-level empty state
 * when the For You shelf is empty, rather than duplicating it. */
export function EmptyState() {
  return (
    <>
      <p className="text-lg font-semibold">No Frames yet</p>
      <p className="text-sm text-text-secondary max-w-xs">
        FRAMES is just getting started — be the first to upload something worth watching.
      </p>
      <Link
        href="/upload"
        className="mt-2 px-5 py-2.5 rounded-full bg-primary text-bg text-sm font-semibold"
      >
        Upload a Frame
      </Link>
    </>
  );
}

export function SwipeFeed({
  videos,
  showSearchButton,
}: {
  videos: Video[];
  /** Forwarded to VideoCard — see its own doc comment. Omit to keep the
   * default (shown), which is what /watch/[id] (this feed's one dockless
   * caller) wants; every (app)-shell caller passes false explicitly since
   * the dock/rail already has Search there. */
  showSearchButton?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const cardRefs = useRef<(VideoCardHandle | null)[]>([]);
  const toggleMuted = usePlayerStore((s) => s.toggleMuted);
  const directorMode = usePlayerStore((s) => s.directorMode);
  const isScrubbing = usePlayerStore((s) => s.isScrubbing);
  const enterDirectorMode = usePlayerStore((s) => s.enterDirectorMode);
  const exitDirectorMode = usePlayerStore((s) => s.exitDirectorMode);
  const showDirectorModeHint = usePlayerStore((s) => s.showDirectorModeHint);
  const setShowDirectorModeHint = usePlayerStore((s) => s.setShowDirectorModeHint);

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
  }, [videos.length]);

  // Auto-engage Director Mode after a beat so the feed defaults to
  // cinematic, chrome-free viewing rather than requiring an explicit tap.
  // Never while scrubbing (chrome fading mid-drag would yank the scrub bar
  // out from under the user's finger) or with nothing playing — no point
  // hiding the nav over an empty state.
  useEffect(() => {
    if (directorMode || isScrubbing || videos.length === 0) return;
    const timer = window.setTimeout(() => {
      enterDirectorMode();
      // First time ever chrome auto-hides in this browser: a brief,
      // non-repeating hint that a tap brings it back. Never shown again
      // after this, on this device — recovery is the same single tap every
      // time, this just makes sure it's discovered once.
      if (!hasSeenDirectorModeHint()) {
        markDirectorModeHintSeen();
        setShowDirectorModeHint(true);
        window.setTimeout(() => setShowDirectorModeHint(false), DIRECTOR_MODE_HINT_DURATION_MS);
      }
    }, AUTO_DIRECTOR_MODE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [activeIndex, directorMode, isScrubbing, videos.length, enterDirectorMode, setShowDirectorModeHint]);

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
        cardRefs.current[activeIndex]?.handleTap();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleMuted, activeIndex]);

  return (
    <div className="relative h-dvh w-full">
      <RotateDevicePrompt />

      {/* One-time, non-repeating first-use hint — see the timeout in the
          auto-engage effect above for when this actually fires. Purely
          informational (pointer-events-none): it must never be the thing
          standing between a user and the content, since a tap anywhere on
          the video already does the job this describes. */}
      <AnimatePresence>
        {showDirectorModeHint && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={CHROME_FADE_TRANSITION}
            className="fixed inset-x-0 top-1/2 -translate-y-1/2 z-40 flex justify-center pointer-events-none px-6"
          >
            <span className="px-4 py-2 rounded-full bg-bg/70 backdrop-blur-md border border-white/10 text-xs font-medium">
              Tap to show controls
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {videos.length === 0 ? (
        <div className="h-dvh w-full flex flex-col items-center justify-center gap-3 text-center px-6">
          <EmptyState />
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
                showSearchButton={showSearchButton}
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
