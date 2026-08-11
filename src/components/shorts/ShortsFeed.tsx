"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { ActionRail } from "@/components/feed/ActionRail";
import { Avatar } from "@/components/ui/Avatar";
import { CommentDrawer } from "@/components/feed/CommentDrawer";
import { VideoOptionsSheet } from "@/components/feed/VideoOptionsSheet";
import { usePlayerStore } from "@/store/player-store";
import { useEngagementStore } from "@/store/engagement-store";
import { CHROME_FADE_TRANSITION, FOCUS_PULL_TRANSITION } from "@/lib/motion";
import { CHROME_TAP_SCALE } from "@/lib/chrome";
import type { Video } from "@/lib/types";

// Real <video> elements are mounted only this close to the active short —
// same reasoning as SwipeFeed's RENDER_WINDOW, just a smaller window since
// shorts are lighter-weight.
const RENDER_WINDOW = 1;

// Shares SwipeFeed's Director Mode flag (usePlayerStore) rather than its
// own separate reveal timer — like/comment/share/caption/search now fade
// together as one chrome cluster here too, same as the main feed, and the
// landscape nav dock (which lives outside either feed, in the app shell)
// watches this same flag to know when to reveal itself. Matches SwipeFeed's
// own auto-engage delay exactly, for the same reason: consistent pacing
// across every video-watching surface in the app.
const AUTO_DIRECTOR_MODE_DELAY_MS = 2500;

// One full-viewport video at a time, snap-scrolled — same "no black bars,
// never cropped" tile as SwipeFeed's VideoCard: a blurred backdrop fills
// any letterbox space around the video rather than cropping it or leaving
// black bars. Was a small aspect-video card cascade before (multiple tiles
// visible at once, peeking above/below); this matches the main feed's own
// full-screen-per-tile pattern instead.

/** `initialId` lets a caller open this feed scoped to an arbitrary list
 * (search results, a creator's profile) starting at one specific short —
 * mirrors SwipeFeed's `?v=` deep-link, as a prop instead since callers here
 * already have the id in hand rather than needing to read it from the URL
 * themselves. */
export function ShortsFeed({ shorts, initialId }: { shorts: Video[]; initialId?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const initialIndex = useMemo(() => {
    if (!initialId) return 0;
    const idx = shorts.findIndex((s) => s.id === initialId);
    return idx >= 0 ? idx : 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);

  const directorMode = usePlayerStore((s) => s.directorMode);
  const isScrubbing = usePlayerStore((s) => s.isScrubbing);
  const enterDirectorMode = usePlayerStore((s) => s.enterDirectorMode);
  const exitDirectorMode = usePlayerStore((s) => s.exitDirectorMode);
  const showActions = !directorMode;

  // Read once per render, looked up per-tile below — same store VideoOverlay
  // (the main feed's equivalent caption) uses for its own Follow pill.
  const followedCreators = useEngagementStore((s) => s.followedCreators);
  const toggleFollow = useEngagementStore((s) => s.toggleFollow);

  // Director Mode is scoped to whichever feed is actually on screen —
  // don't leave it engaged for some other route after navigating away.
  useEffect(() => {
    return () => exitDirectorMode();
  }, [exitDirectorMode]);

  // Auto-engage after a beat of no interaction, mirroring SwipeFeed's own
  // effect exactly (see that file for the full reasoning) — deliberately
  // does NOT force chrome back on when activeIndex changes; once hidden it
  // stays hidden through further scrolling, same fix as SwipeFeed got.
  useEffect(() => {
    if (directorMode || isScrubbing) return;
    const timer = window.setTimeout(enterDirectorMode, AUTO_DIRECTOR_MODE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [activeIndex, directorMode, isScrubbing, enterDirectorMode]);

  // Tiles are exactly one viewport each now (snap-start), same as
  // SwipeFeed's own deep-link jump — no spacer math needed, just scroll
  // straight to the target tile's offset before first paint.
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

    // Same as SwipeFeed's own observer — each tile is exactly one viewport
    // tall (snap-start), so a plain intersection-ratio threshold is enough;
    // no center-line rootMargin trick needed now that tiles can't overlap
    // the viewport two-at-a-time at rest.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveIndex(Number((entry.target as HTMLElement).dataset.index));
          }
        }
      },
      { root: container, threshold: 0.6 }
    );

    sectionRefs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [shorts.length]);

  // Two separate bugs were stacked here, both traced with real instrumentation
  // rather than guessed:
  //
  // 1. `shorts` arrives async (the page fetches it, starts at []) — on the
  //    very first render there are zero <video> elements at all, so
  //    videoRefs.current is genuinely empty (confirmed: logged its real
  //    length, not a stale/live console reference, it was 0). This effect's
  //    dependency array was only [activeIndex], which doesn't change once
  //    the real videos actually mount a moment later — so it never re-ran
  //    once there was anything to play. Now also depends on shorts.length.
  //
  // 2. Even once refs exist, a freshly-mounted <video> often isn't past
  //    HAVE_FUTURE_DATA yet the instant this effect fires — play() on it
  //    can reject, and .catch(() => {}) was silently swallowing that with
  //    nothing ever retrying (confirmed: the videos were fully loaded and
  //    played fine when forced manually later, they just never got a
  //    play() call that landed at the right moment). Waits for loadeddata
  //    when not ready yet, instead of trying once and giving up.
  useEffect(() => {
    const cleanups: (() => void)[] = [];
    videoRefs.current.forEach((video, index) => {
      if (!video) return;
      if (index !== activeIndex) {
        video.pause();
        return;
      }
      if (video.readyState >= 3) {
        video.play().catch(() => {});
      } else {
        const onReady = () => video.play().catch(() => {});
        video.addEventListener("loadeddata", onReady, { once: true });
        cleanups.push(() => video.removeEventListener("loadeddata", onReady));
      }
    });
    return () => cleanups.forEach((fn) => fn());
  }, [activeIndex, shorts.length]);

  // Had no keyboard path at all before this — SwipeFeed's own arrow-key
  // scroll (src/components/feed/SwipeFeed.tsx) was never mirrored here.
  // Each tile is exactly one viewport tall now, so scrolling by
  // clientHeight (same as SwipeFeed) always moves exactly one short.
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
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (shorts.length === 0) {
    return (
      <div className="relative flex flex-col items-center justify-center h-dvh text-center px-6 gap-2">
        <p className="text-sm font-medium">No shorts yet</p>
        <p className="text-xs text-text-secondary">Be the first to post one.</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label={`Shorts, ${activeIndex + 1} of ${shorts.length}`}
      onClick={exitDirectorMode}
      className="relative h-dvh w-full overflow-y-scroll snap-y snap-mandatory no-scrollbar bg-bg"
    >
      {shorts.map((short, index) => {
        const active = index === activeIndex;
        const withinRenderWindow = Math.abs(index - activeIndex) <= RENDER_WINDOW;

        return (
          <div
            key={short.id}
            ref={(el) => {
              sectionRefs.current[index] = el;
            }}
            data-index={index}
            aria-label={`${short.title} by @${short.creator.username}`}
            aria-hidden={!active}
            // snap-always (scroll-snap-stop: always) is the actual fix for
            // "swipe feels rough" — without it, a fast/hard swipe flings
            // straight past the next tile to whichever one momentum
            // happens to land on, skipping 2-3 at once unpredictably. This
            // forces the browser to stop at every tile regardless of fling
            // speed, so one swipe always moves exactly one short.
            className="relative h-dvh w-full snap-start snap-always overflow-hidden bg-bg"
          >
            {/* Plain black letterboxing above/below the video (bg-bg on
                the section itself) — no blurred backdrop here, unlike
                VideoCard.tsx's main feed. The video itself is still never
                cropped or stretched (object-contain below). */}
            <motion.div
              className="absolute inset-0 flex items-center justify-center"
              animate={{
                opacity: active ? 1 : 0.85,
                scale: active ? 1 : 0.98,
                filter: active ? "blur(0px)" : "blur(3px)",
              }}
              transition={FOCUS_PULL_TRANSITION}
            >
              {withinRenderWindow ? (
                <video
                  ref={(el) => {
                    videoRefs.current[index] = el;
                  }}
                  src={short.playbackUrl}
                  poster={short.posterUrl}
                  className="w-full h-full object-contain"
                  muted
                  loop
                  playsInline
                />
              ) : (
                <Image src={short.posterUrl} alt="" fill className="object-contain" />
              )}
            </motion.div>

            {active && (
              <>
                <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-bg/90 via-bg/30 to-transparent pointer-events-none" />
                <motion.div
                  animate={{ opacity: directorMode ? 0 : 1 }}
                  transition={CHROME_FADE_TRANSITION}
                  // Bottom padding clears the floating mobile bottom-nav
                  // dock — same clearance VideoCard.tsx's own caption uses,
                  // needed here now that the tile is full-viewport (a small
                  // cascading card never reached the true screen bottom).
                  className="absolute inset-x-0 bottom-0 px-4 pb-[calc(env(safe-area-inset-bottom)+5.5rem)] md:pb-10 flex flex-col gap-0.5"
                >
                  <div className="flex items-center gap-2">
                    {/* Moved down from the action rail — reads more
                        naturally next to the name it's actually about,
                        same reasoning VideoOverlay.tsx already applied to
                        the Follow pill next to it. Links to the creator's
                        profile, same /profile/[username] route search
                        results/profile grids already use. */}
                    <Link
                      href={`/profile/${short.creator.username}`}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`View @${short.creator.username}'s profile`}
                    >
                      <Avatar
                        src={short.creator.avatarUrl}
                        alt={short.creator.displayName}
                        size={28}
                        ring
                      />
                    </Link>
                    <span className="text-sm font-semibold leading-tight">@{short.creator.username}</span>
                    {/* Same "Follow" -> "Following" pill as VideoOverlay.tsx's
                        main-feed caption — stays visible once followed
                        (relabeled, dimmed) rather than disappearing. */}
                    <motion.button
                      whileTap={{ scale: CHROME_TAP_SCALE }}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFollow(short.creator.id);
                      }}
                      aria-label={
                        followedCreators[short.creator.id]
                          ? `Unfollow @${short.creator.username}`
                          : `Follow @${short.creator.username}`
                      }
                      className={cn(
                        "px-2.5 py-1 rounded-full backdrop-blur-md border text-[10px] font-semibold shrink-0 transition-colors",
                        followedCreators[short.creator.id]
                          ? "bg-card/50 border-border text-text-secondary"
                          : "bg-card/80 border-border text-accent"
                      )}
                    >
                      {followedCreators[short.creator.id] ? "Following" : "Follow"}
                    </motion.button>
                  </div>
                  <p className="text-xs text-text-secondary leading-tight truncate">{short.title}</p>
                </motion.div>
              </>
            )}
          </div>
        );
      })}

      {/* Fixed to the viewport, not nested in the active tile — doesn't
          need to migrate tile-to-tile as activeIndex changes, it just
          points at whichever short is active. An invisible box with the
          exact same w-full + aspect-ratio + vertical-centering as the real
          video (see the tile above) lines this up with the video's own
          visible bounds without measuring anything — same trick as
          Shelf.tsx sizing cards off video.width/height, just for layout
          math instead of a fixed aspect box. */}
      {shorts[activeIndex] && (
        <>
          <div className="fixed inset-0 h-dvh w-full flex items-center justify-center pointer-events-none z-30">
            <div
              className="relative w-full"
              style={{ aspectRatio: `${shorts[activeIndex].width} / ${shorts[activeIndex].height}` }}
            >
              <AnimatePresence>
                {showActions && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={CHROME_FADE_TRANSITION}
                    className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-auto"
                  >
                    <ActionRail
                      video={shorts[activeIndex]}
                      onOpenComments={() => setCommentsOpen(true)}
                      onOpenOptions={() => setOptionsOpen(true)}
                      compact
                      showAvatar={false}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
          <CommentDrawer
            video={shorts[activeIndex]}
            open={commentsOpen}
            onClose={() => setCommentsOpen(false)}
          />
          <VideoOptionsSheet
            video={shorts[activeIndex]}
            open={optionsOpen}
            onClose={() => setOptionsOpen(false)}
          />
        </>
      )}
    </div>
  );
}
