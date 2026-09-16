"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { PlayerTransport } from "@/components/player/PlayerTransport";
import { PausedWatermark } from "@/components/player/PausedWatermark";
import { ActionRail } from "./ActionRail";
import { PlaybackControls } from "./PlaybackControls";
import { VideoOverlay } from "./VideoOverlay";
import { CommentDrawer } from "./CommentDrawer";
import { VideoOptionsSheet } from "./VideoOptionsSheet";
import { VideoDetailsSheet } from "./VideoDetailsSheet";
import { ClipCreateSheet } from "./ClipCreateSheet";
import { SearchButton } from "@/components/ui/SearchButton";
import { usePlayerStore } from "@/store/player-store";
import { useCurrentUserStore } from "@/store/current-user-store";
import { createClient } from "@/lib/supabase/client";
import { fadeVolume, playWithMutedFallback } from "@/lib/audio";
import { recordVideoView } from "@/lib/video-views";
import { useCastControl } from "@/lib/cast";
import { FOCUS_PULL_TRANSITION, CHROME_FADE_TRANSITION } from "@/lib/motion";
import type { Video } from "@/lib/types";

export type VideoCardHandle = {
  /** Toggle playback and reveal the player controls. */
  handleTap: () => void;
};

type VideoCardProps = {
  video: Video;
  active: boolean;
  index: number;
  sectionRef: (el: HTMLElement | null) => void;
  /** Pages inside the (app) shell already have Search on the dock/rail —
   * this only needs to render on /watch/[id], the one chrome-free route
   * with no dock at all. Defaults true so that route (which passes no
   * prop) keeps it. */
  showSearchButton?: boolean;
};

export const VideoCard = forwardRef<VideoCardHandle, VideoCardProps>(function VideoCard(
  { video, active, index, sectionRef, showSearchButton = true },
  ref
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(true);
  const [duration, setDuration] = useState(0);
  const manuallyPaused = useRef(false);
  const activeRef = useRef(active);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [clipOpen, setClipOpen] = useState(false);
  // Set only while playing back a tapped Community Clip — handleTimeUpdate
  // pauses once currentTime reaches this, then clears it. A virtual clip:
  // just bounded playback of this same <video>/playbackUrl, no separate
  // asset or route.
  const clipEndRef = useRef<number | null>(null);
  const muted = usePlayerStore((s) => s.muted);
  const directorMode = usePlayerStore((s) => s.directorMode);
  const toggleDirectorMode = usePlayerStore((s) => s.toggleDirectorMode);
  const setScrubbing = usePlayerStore((s) => s.setScrubbing);
  const ownProfile = useCurrentUserStore((s) => s.profile);
  const { available: castAvailable, triggerCast } = useCastControl(() => videoRef.current);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    activeRef.current = active;

    if (!active) {
      // Leaving this scene — record it as watched before the position resets
      // (below), so Home's History section has something real to read, and
      // record a real view (record_video_view is insert-once per viewer per
      // video server-side, so this is safe to call every time this branch
      // runs, not just the first). Below a few seconds is probably a
      // scroll-past, not a watch — not worth recording either. Fire-and-
      // forget: neither is worth blocking or erroring the actual scroll
      // transition over.
      if (ownProfile && el.currentTime > 3) {
        const supabase = createClient();
        supabase
          .from("watch_progress")
          .upsert({
            user_id: ownProfile.id,
            video_id: video.id,
            position_seconds: el.currentTime,
            updated_at: new Date().toISOString(),
          })
          .then(
            () => {},
            () => {}
          );
        recordVideoView(video.id);
      }

      // Fade audio out before the hard cut, don't just snap silent.
      if (!muted) fadeVolume(el, el.volume || 1, 0, 250);
      const t = window.setTimeout(
        () => {
          el.pause();
          el.currentTime = 0;
          setProgress(0);
        },
        muted ? 0 : 250
      );
      return () => window.clearTimeout(t);
    }

    if (manuallyPaused.current) return;

    // isCancelled guards playWithMutedFallback's rejected-play retry, which
    // resolves asynchronously — without it, scrolling past this card before
    // that promise settles could silently resume it playing off-screen.
    let cancelled = false;
    playWithMutedFallback(
      el,
      muted,
      () => cancelled || manuallyPaused.current,
      () => fadeVolume(el, 0, 1, 500)
    );

    return () => {
      cancelled = true;
    };
    // ownProfile/video.id intentionally excluded — this effect governs
    // play/pause timing on scroll, not history-writing; picking up a
    // slightly stale profile/video reference for the fire-and-forget write
    // above is harmless and not worth re-triggering play/pause over.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, muted]);

  function handleTimeUpdate() {
    const el = videoRef.current;
    if (!el || !Number.isFinite(el.duration) || el.duration <= 0) return;
    setProgress(el.currentTime / el.duration);

    if (clipEndRef.current !== null && el.currentTime >= clipEndRef.current) {
      manuallyPaused.current = true;
      el.pause();
      clipEndRef.current = null;
    }
  }

  /** Community Clips playback — a virtual clip is just this same video
   * seeked to a start offset with a bounded end, no separate asset/route. */
  function playClip(startSeconds: number, endSeconds: number) {
    const el = videoRef.current;
    if (!el) return;
    manuallyPaused.current = false;
    el.currentTime = startSeconds;
    clipEndRef.current = endSeconds;
    el.play().catch(() => {});
    setDetailsOpen(false);
  }

  function handleTap() {
    const el = videoRef.current;
    if (!el || !active) return;
    if (directorMode) toggleDirectorMode();
    if (el.paused) {
      manuallyPaused.current = false;
      playWithMutedFallback(el, muted, () => !activeRef.current || manuallyPaused.current || !el.isConnected);
    } else {
      manuallyPaused.current = true;
      el.pause();
    }
  }

  useEffect(() => () => { setScrubbing(false); activeRef.current = false; }, [setScrubbing]);

  useImperativeHandle(ref, () => ({ handleTap }));

  return (
    <section
      ref={sectionRef}
      data-index={index}
      className="relative h-dvh w-full snap-start snap-always overflow-hidden bg-bg"
    >
      {/* Plain black letterboxing above/below the video (bg-bg on the
          section itself, set below) — matches ShortsFeed's own treatment,
          no blurred backdrop image here anymore. The video itself is still
          never cropped or stretched (object-contain below). */}

      {/* centered video at its native aspect ratio, with a gentle focus-pull as it
          becomes the active scene — object-contain means this works unmodified for
          16:9, 21:9, or 16:10; never cropped, never stretched */}
      <motion.div
        className="absolute inset-0 flex items-center justify-center cursor-pointer"
        onClick={handleTap}
        animate={{
          opacity: active ? 1 : 0.85,
          scale: active ? 1 : 0.98,
          filter: active ? "blur(0px)" : "blur(3px)",
        }}
        transition={FOCUS_PULL_TRANSITION}
      >
        <video
          ref={videoRef}
          src={video.playbackUrl}
          poster={video.posterUrl}
          className="w-full h-full object-contain"
          muted={muted}
          loop
          playsInline
          preload={active ? "auto" : "none"}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={(e) => setDuration(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)}
          onDurationChange={(e) => setDuration(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)}
          onPlay={() => setPaused(false)}
          onPause={() => setPaused(true)}
        />
        <PausedWatermark visible={active && paused && duration > 0} />
      </motion.div>

      <AnimatePresence>
        {!directorMode && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={CHROME_FADE_TRANSITION}
            className="absolute inset-0 pointer-events-none"
          >
            {/* gradient for legibility */}
            <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-bg/90 via-bg/30 to-transparent pointer-events-none" />

            {/* Bounds the overlay chrome to a sane content column on ultra-wide
                monitors, so captions/actions stay visually anchored near the video
                instead of floating at the far edges of a huge viewport. */}
            <div className="absolute inset-0 max-w-[1920px] mx-auto pointer-events-none">
              {/* No manual "enter full screen" (Director Mode is always the
                  resting state, auto-engaged by the timer). Your own
                  profile used to have an avatar link in the right-side
                  cluster too — now ProfileFloat, fixed a row below this
                  one, present on every page rather than just while a
                  video's on screen. */}
              <div className="pointer-events-auto absolute top-4 left-4 md:top-6 md:left-6 z-10">
                <PlaybackControls castAvailable={castAvailable} onCast={triggerCast} />
              </div>

              {/* landscape:hidden — /watch/[id] is the one chrome-free
                  route with no dock, so this and ProfileFloat are the only
                  way to reach search/profile there at all in portrait. In
                  landscape they used to just sit here unconditionally,
                  same top-right corner the action rail's own column needs
                  room in — every OTHER landscape accommodation in this app
                  (useIsLandscapeMobile, RotateDevicePrompt's "full
                  cinematic view" copy) is scoped to short-height rotated
                  phones only, so iPad landscape (tall) got none of it and
                  these two never moved. Hiding them outright rather than
                  repositioning: landscape is already this app's intended
                  minimal-chrome cinematic mode, and search/profile from
                  here are conveniences, not the only way to reach either
                  (rotate back to portrait, or use the dock on any other
                  page). */}
              {showSearchButton && (
                <div className="pointer-events-auto absolute top-4 right-4 md:top-6 md:right-6 z-10 flex items-center gap-2 landscape:hidden">
                  <SearchButton />
                </div>
              )}

              {/* Keep attribution above the transport and navigation dock. */}
              <div className="pointer-events-auto absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 px-4 md:px-8 pb-[calc(env(safe-area-inset-bottom)+10rem)] [@media(orientation:landscape)_and_(max-height:500px)]:pb-16">
                <VideoOverlay video={video} onOpenDetails={() => setDetailsOpen(true)} />
                <ActionRail
                  video={video}
                  onOpenComments={() => setCommentsOpen(true)}
                  onOpenOptions={() => setOptionsOpen(true)}
                  onOpenClip={() => setClipOpen(true)}
                />
              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {active && (
        <PlayerTransport
          hidden={directorMode}
          paused={paused}
          time={progress * duration}
          duration={duration}
          onToggle={handleTap}
          onSeek={(seconds) => {
            const el = videoRef.current;
            if (!el || !duration) return;
            clipEndRef.current = null;
            el.currentTime = seconds;
            setProgress(seconds / duration);
          }}
          className="absolute inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+6rem)] z-20 sm:inset-x-6 [@media(orientation:landscape)_and_(max-height:500px)]:bottom-3 [@media(orientation:landscape)_and_(max-height:500px)]:left-24"
        />
      )}

      <CommentDrawer video={video} open={commentsOpen} onClose={() => setCommentsOpen(false)} />
      <VideoOptionsSheet video={video} open={optionsOpen} onClose={() => setOptionsOpen(false)} />
      <VideoDetailsSheet
        video={video}
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        onPlayClip={playClip}
      />
      <ClipCreateSheet video={video} open={clipOpen} onClose={() => setClipOpen(false)} />
    </section>
  );
});
