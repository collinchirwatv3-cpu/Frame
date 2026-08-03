"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { Maximize2, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { ActionRail } from "./ActionRail";
import { VideoOverlay } from "./VideoOverlay";
import { CommentDrawer } from "./CommentDrawer";
import { VideoOptionsSheet } from "./VideoOptionsSheet";
import { VideoDetailsSheet } from "./VideoDetailsSheet";
import { usePlayerStore } from "@/store/player-store";
import { fadeVolume } from "@/lib/audio";
import { FOCUS_PULL_TRANSITION, CHROME_FADE_TRANSITION } from "@/lib/motion";
import type { Video } from "@/lib/types";

export type VideoCardHandle = {
  togglePlay: () => void;
};

type VideoCardProps = {
  video: Video;
  active: boolean;
  index: number;
  sectionRef: (el: HTMLElement | null) => void;
};

export const VideoCard = forwardRef<VideoCardHandle, VideoCardProps>(function VideoCard(
  { video, active, index, sectionRef },
  ref
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [progress, setProgress] = useState(0);
  const [showPauseGlyph, setShowPauseGlyph] = useState(false);
  const [manuallyPaused, setManuallyPaused] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const muted = usePlayerStore((s) => s.muted);
  const toggleMuted = usePlayerStore((s) => s.toggleMuted);
  const directorMode = usePlayerStore((s) => s.directorMode);
  const toggleDirectorMode = usePlayerStore((s) => s.toggleDirectorMode);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    if (!active) {
      // Leaving this scene — fade audio out before the hard cut, don't just snap silent.
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

    if (manuallyPaused) {
      el.pause();
      return;
    }

    el.play().catch(() => {});
    if (!muted) fadeVolume(el, 0, 1, 500);
  }, [active, manuallyPaused, muted]);

  useEffect(() => {
    if (!active) setManuallyPaused(false);
  }, [active]);

  function handleTimeUpdate() {
    const el = videoRef.current;
    if (!el || !el.duration) return;
    setProgress(el.currentTime / el.duration);
  }

  function togglePlay() {
    if (directorMode) {
      toggleDirectorMode();
      return;
    }
    setManuallyPaused((v) => !v);
    setShowPauseGlyph(true);
    window.setTimeout(() => setShowPauseGlyph(false), 500);
  }

  useImperativeHandle(ref, () => ({ togglePlay }));

  return (
    <section
      ref={sectionRef}
      data-index={index}
      className="relative h-dvh w-full snap-start snap-always overflow-hidden bg-bg"
    >
      {/* blurred cinematic backdrop fills any letterbox space — no black bars */}
      <div className="absolute inset-0">
        <Image
          src={video.posterUrl}
          alt=""
          fill
          className="object-cover scale-125 blur-3xl opacity-40"
          priority={active}
        />
      </div>

      {/* centered video at its native aspect ratio, with a gentle focus-pull as it
          becomes the active scene — object-contain means this works unmodified for
          16:9, 21:9, or 16:10; never cropped, never stretched */}
      <motion.div
        className="absolute inset-0 flex items-center justify-center cursor-pointer"
        onClick={togglePlay}
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
        />

        <AnimatePresence>
          {showPauseGlyph && (
            <motion.div
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className="absolute w-16 h-16 rounded-full bg-bg/50 flex items-center justify-center pointer-events-none"
            >
              {manuallyPaused ? (
                <Play size={28} className="text-accent ml-1" fill="currentColor" />
              ) : (
                <Pause size={28} className="text-accent" fill="currentColor" />
              )}
            </motion.div>
          )}
        </AnimatePresence>
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
              {/* director mode + mute */}
              <div className="pointer-events-auto absolute top-4 right-4 md:top-6 md:right-6 z-10 flex items-center gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleDirectorMode();
                  }}
                  aria-label="Enter Director Mode"
                  className="w-9 h-9 rounded-full bg-card/70 backdrop-blur-md flex items-center justify-center"
                >
                  <Maximize2 size={15} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleMuted();
                  }}
                  aria-label={muted ? "Unmute" : "Mute"}
                  className="w-9 h-9 rounded-full bg-card/70 backdrop-blur-md flex items-center justify-center"
                >
                  {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                </button>
              </div>

              {/* bottom overlay: creator info + action rail — cleared above the mobile bottom nav */}
              <div className="pointer-events-auto absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 px-4 md:px-8 pb-[calc(env(safe-area-inset-bottom)+5.5rem)] md:pb-10">
                <VideoOverlay video={video} onOpenDetails={() => setDetailsOpen(true)} />
                <ActionRail
                  video={video}
                  onOpenComments={() => setCommentsOpen(true)}
                  onOpenOptions={() => setOptionsOpen(true)}
                />
              </div>

              {/* playback progress indicator — sits above the mobile bottom nav */}
              <div className="pointer-events-auto absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4rem)] md:bottom-0 h-[2px] bg-border/60">
                <div
                  className="h-full bg-primary transition-[width] duration-150 ease-linear"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <CommentDrawer video={video} open={commentsOpen} onClose={() => setCommentsOpen(false)} />
      <VideoOptionsSheet video={video} open={optionsOpen} onClose={() => setOptionsOpen(false)} />
      <VideoDetailsSheet video={video} open={detailsOpen} onClose={() => setDetailsOpen(false)} />
    </section>
  );
});
