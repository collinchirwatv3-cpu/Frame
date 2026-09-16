"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { PlayerTransport } from "@/components/player/PlayerTransport";
import { PausedWatermark } from "@/components/player/PausedWatermark";
import Link from "next/link";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { cn, formatCount } from "@/lib/utils";
import { ActionRail } from "@/components/feed/ActionRail";
import { PlaybackControls } from "@/components/feed/PlaybackControls";
import { Avatar } from "@/components/ui/Avatar";
import { CommentDrawer } from "@/components/feed/CommentDrawer";
import { VideoOptionsSheet } from "@/components/feed/VideoOptionsSheet";
import { usePlayerStore } from "@/store/player-store";
import { useEngagementStore } from "@/store/engagement-store";
import { useCurrentUserStore } from "@/store/current-user-store";
import { playWithMutedFallback } from "@/lib/audio";
import { recordVideoView } from "@/lib/video-views";
import { useCastControl } from "@/lib/cast";
import { isTypingTarget } from "@/lib/is-typing-target";
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
  const activeVideoRef = useRef<HTMLVideoElement | null>(null);
  const initialIndex = useMemo(() => {
    if (!initialId) return 0;
    const idx = shorts.findIndex((s) => s.id === initialId);
    return idx >= 0 ? idx : 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [pausedId, setPausedId] = useState<string | null>(null);
  const pausedIdRef = useRef<string | null>(null);
  const [playback, setPlayback] = useState<Record<string, { time: number; duration: number; paused: boolean }>>({});
  const activeShort = shorts[activeIndex];
  const currentPlayback = activeShort ? playback[activeShort.id] : null;
  const duration = currentPlayback?.duration ?? 0;
  const position = Math.min(currentPlayback?.time ?? 0, duration);
  const setScrubbing = usePlayerStore((s) => s.setScrubbing);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);

  const muted = usePlayerStore((s) => s.muted);
  const directorMode = usePlayerStore((s) => s.directorMode);
  const isScrubbing = usePlayerStore((s) => s.isScrubbing);
  const enterDirectorMode = usePlayerStore((s) => s.enterDirectorMode);
  const exitDirectorMode = usePlayerStore((s) => s.exitDirectorMode);
  const showActions = !directorMode;
  const { available: castAvailable, triggerCast } = useCastControl(
    () => videoRefs.current[activeIndex] ?? null
  );

  // Read once per render, looked up per-tile below — same store VideoOverlay
  // (the main feed's equivalent caption) uses for its own Follow pill.
  const followedCreators = useEngagementStore((s) => s.followedCreators);
  const toggleFollow = useEngagementStore((s) => s.toggleFollow);
  const ownProfile = useCurrentUserStore((s) => s.profile);

  // Director Mode is scoped to whichever feed is actually on screen —
  // don't leave it engaged for some other route after navigating away.
  useEffect(() => {
    return () => { exitDirectorMode(); setScrubbing(false); };
  }, [exitDirectorMode, setScrubbing]);

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
    activeVideoRef.current = videoRefs.current[activeIndex] ?? null;
    const cleanups: (() => void)[] = [];
    // Guards playWithMutedFallback's rejected-play retry (see its own doc
    // comment) — without it, swiping to the next short before a blocked
    // unmuted play()'s rejection arrives could silently resume this one
    // playing off-screen.
    let cancelled = false;

    videoRefs.current.forEach((video, index) => {
      if (!video) return;
      if (index !== activeIndex) {
        // Same >3s "real watch, not a scroll-past" threshold VideoCard.tsx
        // uses for watch_progress — record_video_view is insert-once per
        // viewer per video server-side, so re-firing this on every effect
        // rerun (e.g. toggling mute) for an already-watched neighbor is a
        // harmless no-op, not worth deduping client-side.
        if (ownProfile && video.currentTime > 3) recordVideoView(shorts[index].id);
        video.pause();
        return;
      }
      if (pausedId === shorts[index].id) {
        video.pause();
        return;
      }
      const isCancelled = () => cancelled || pausedIdRef.current === shorts[index].id;
      if (video.readyState >= 3) {
        playWithMutedFallback(video, muted, isCancelled);
      } else {
        const onReady = () => playWithMutedFallback(video, muted, isCancelled);
        video.addEventListener("loadeddata", onReady, { once: true });
        cleanups.push(() => video.removeEventListener("loadeddata", onReady));
      }
    });
    return () => {
      cancelled = true;
      activeVideoRef.current = null;
      cleanups.forEach((fn) => fn());
    };
  }, [activeIndex, shorts, muted, ownProfile, pausedId]);

  // Had no keyboard path at all before this — SwipeFeed's own arrow-key
  // scroll (src/components/feed/SwipeFeed.tsx) was never mirrored here.
  // Each tile is exactly one viewport tall now, so scrolling by
  // clientHeight (same as SwipeFeed) always moves exactly one short.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const container = containerRef.current;
      if (!container) return;

      // Same guard as SwipeFeed's identical listener — this is on
      // `window`, so without it, j/k/arrow keys typed into a modal's text
      // field stacked on top of the feed (Edit Frame's description, a
      // comment composer, etc.) get eaten and scroll the feed instead of
      // moving the text cursor.
      if (isTypingTarget(document.activeElement)) return;

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

  function syncPlayback(video: HTMLVideoElement, id: string, active: boolean) {
    if (!active) return;
    const state = { time: video.currentTime, duration: Number.isFinite(video.duration) ? video.duration : 0, paused: video.paused };
    setPlayback((previous) => ({ ...previous, [id]: state }));
  }

  function togglePlayback() {
    const video = videoRefs.current[activeIndex];
    if (!video || !activeShort) return;
    if (video.paused) {
      pausedIdRef.current = null;
      setPausedId(null);
      playWithMutedFallback(video, muted, () => activeVideoRef.current !== video || pausedIdRef.current === activeShort.id || !video.isConnected);
    } else {
      pausedIdRef.current = activeShort.id;
      setPausedId(activeShort.id);
      video.pause();
    }
  }

  if (shorts.length === 0) {
    return (
      <div className="relative flex flex-col items-center justify-center h-dvh text-center px-6 gap-2">
        <p className="text-sm font-medium">No Frames yet</p>
        <p className="text-xs text-text-secondary">Be the first to post one.</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label={`Frames, ${activeIndex + 1} of ${shorts.length}`}
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
                the section itself) — same plain-black treatment
                VideoCard.tsx's main feed uses now too (it used to have its
                own blurred backdrop instead; dropped for a consistent
                letterboxed look across both feeds). The video itself is
                still never cropped or stretched (object-contain below). */}
            <motion.div
              className="absolute inset-0 flex items-center justify-center"
              onClick={() => { if (active) togglePlayback(); }}
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
                  onTimeUpdate={(e) => syncPlayback(e.currentTarget, short.id, active)}
                  onLoadedMetadata={(e) => syncPlayback(e.currentTarget, short.id, active)}
                  onDurationChange={(e) => syncPlayback(e.currentTarget, short.id, active)}
                  onPlay={(e) => syncPlayback(e.currentTarget, short.id, active)}
                  onPause={(e) => syncPlayback(e.currentTarget, short.id, active)}
                  src={short.playbackUrl}
                  poster={short.posterUrl}
                  className="w-full h-full object-contain"
                  muted={muted}
                  loop
                  playsInline
                />
              ) : (
                <Image src={short.posterUrl} alt="" fill className="object-contain" />
              )}
              <PausedWatermark visible={active && pausedId === short.id && !!currentPlayback?.paused} />
            </motion.div>

            {active && (
              <>
                <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-bg/90 via-bg/30 to-transparent pointer-events-none" />
                <motion.div
                  animate={{ opacity: directorMode ? 0 : 1 }}
                  transition={CHROME_FADE_TRANSITION}
                  // Clear both the transport and the navigation dock.
                  className="absolute inset-x-0 bottom-0 px-4 pb-[calc(env(safe-area-inset-bottom)+10rem)] [@media(orientation:landscape)_and_(max-height:500px)]:pb-16 flex flex-col gap-0.5"
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
                    {/* Display name + handle, same two-line treatment
                        VideoOverlay.tsx uses now — used to be just
                        @username on one line. */}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold leading-tight truncate">
                        {short.creator.displayName}
                      </p>
                      <p className="text-[11px] text-text-secondary leading-tight truncate">
                        @{short.creator.username}
                      </p>
                    </div>
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
                  {short.views !== undefined && (
                    <p className="text-[11px] text-text-secondary/80 leading-tight">
                      {formatCount(short.views)} views
                    </p>
                  )}
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
                  <>
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={CHROME_FADE_TRANSITION}
                      className="absolute left-2 top-4 pointer-events-auto"
                    >
                      <PlaybackControls compact castAvailable={castAvailable} onCast={triggerCast} />
                    </motion.div>
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
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>
          <PlayerTransport
            hidden={directorMode}
            paused={currentPlayback?.paused !== false}
            time={position}
            duration={duration}
            onToggle={togglePlayback}
            onSeek={(seconds) => {
              const video = videoRefs.current[activeIndex];
              if (!video) return;
              video.currentTime = seconds;
              syncPlayback(video, shorts[activeIndex].id, true);
            }}
            className="fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+6rem)] z-40 sm:inset-x-6 [@media(orientation:landscape)_and_(max-height:500px)]:bottom-3 [@media(orientation:landscape)_and_(max-height:500px)]:left-24"
          />
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
