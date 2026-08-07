"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { SearchButton } from "@/components/ui/SearchButton";
import { ActionRail } from "@/components/feed/ActionRail";
import { CommentDrawer } from "@/components/feed/CommentDrawer";
import { VideoOptionsSheet } from "@/components/feed/VideoOptionsSheet";
import type { Video } from "@/lib/types";

// Real <video> elements are mounted only this close to the active short —
// same reasoning as SwipeFeed's RENDER_WINDOW, just a smaller window since
// shorts are lighter-weight (no Director Mode chrome).
const RENDER_WINDOW = 1;

// Like/comment/share/save stay off the video entirely at first — they fade
// in after a beat of actually watching, rather than sitting on screen
// immediately the way they do in the main feed. Inverse of SwipeFeed's
// auto-*hide* timer: here nothing shows until this delay elapses on the
// currently active short, and it resets the instant you scroll to another.
const ACTIONS_REVEAL_DELAY_MS = 3500;

// Every tile is the same size — no separate active-vs-inactive width/scale
// — and stacked with zero gap between them (the tile itself *is* the snap
// section now, no extra wrapping height around it). Only opacity/blur mark
// which one is active.

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
  const [edgeSpacer, setEdgeSpacer] = useState(0);
  // revealedIndex (rather than a plain boolean + an explicit "reset to
  // false" on every activeIndex change) so there's nothing to synchronously
  // set at the top of the effect — showActions falls out of comparing the
  // two, and naturally reads false the instant activeIndex moves on.
  const [revealedIndex, setRevealedIndex] = useState<number | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const hasScrolledToInitialRef = useRef(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setRevealedIndex(activeIndex), ACTIONS_REVEAL_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [activeIndex]);

  const showActions = revealedIndex === activeIndex;

  // Tiles are uniform-size now (no more active-card-is-bigger treatment),
  // so nothing about a tile's own size distinguishes "centered on screen"
  // from "just happens to be first" — a leading spacer sized to exactly
  // half a viewport minus half a tile is what actually centers the first
  // (and, mirrored, the last) tile at rest, rather than leaving them
  // pinned flush to the top/bottom. Re-measures on resize since tile
  // height is width-derived (aspect-video), and on shorts.length changing
  // since there's no tile 0 to measure until the real data arrives.
  //
  // The deep-link scroll (jump straight to `initialId`'s short) has to
  // account for this spacer, not measure against a pre-spacer layout —
  // target.offsetTop below is read while `edgeSpacer` (the state, still
  // whatever it was on the previous render) is what's actually in the DOM
  // right now, but setEdgeSpacer above won't be reflected in the DOM until
  // *after* this function returns. Correcting by the delta between the old
  // and new spacer values gets the right answer in one pass, rather than
  // trying to sequence two effects around a re-render this effect's own
  // dependency array wouldn't even trigger a second time for.
  useLayoutEffect(() => {
    const container = containerRef.current;
    const firstTile = sectionRefs.current[0];
    if (!container || !firstTile) return;

    const newSpacer = Math.max(0, (container.clientHeight - firstTile.offsetHeight) / 2);
    setEdgeSpacer(newSpacer);

    if (!hasScrolledToInitialRef.current && initialIndex > 0) {
      const target = sectionRefs.current[initialIndex];
      if (target) {
        container.scrollTop = target.offsetTop - edgeSpacer + newSpacer;
        hasScrolledToInitialRef.current = true;
      }
    }
    // edgeSpacer deliberately excluded — it's read here as "whatever's
    // currently in the DOM", not as a reactive trigger; depending on it
    // would re-run this on every spacer change, including the one this
    // effect itself just caused.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shorts.length]);

  useEffect(() => {
    function onResize() {
      const container = containerRef.current;
      const firstTile = sectionRefs.current[0];
      if (!container || !firstTile) return;
      setEdgeSpacer(Math.max(0, (container.clientHeight - firstTile.offsetHeight) / 2));
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // rootMargin: "-50% 0px -50% 0px" shrinks the observed root to a
    // zero-height line at the vertical center — a tile only "intersects"
    // while its own box is crossing that exact line, i.e. exactly
    // whichever tile currently occupies the center of the screen. Plain
    // intersection ratio can't express this on its own: tiles are small
    // enough now that more than one can be 100% visible simultaneously (the
    // top one AND the one below it, say), so "highest ratio" doesn't
    // distinguish "at the top" from "in the middle" — position is what
    // actually matters for "the centered one is the main one."
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveIndex(Number((entry.target as HTMLElement).dataset.index));
          }
        }
      },
      { root: container, rootMargin: "-50% 0px -50% 0px", threshold: 0 }
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
  // Scrolls by one tile's actual rendered height (measured directly, not a
  // fixed constant — tile height is aspect-ratio-derived from its width
  // now, which varies by viewport) rather than the full container, so a
  // press never overshoots past more than one short.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const container = containerRef.current;
      const firstTile = sectionRefs.current[0];
      if (!container || !firstTile) return;
      const step = firstTile.offsetHeight;
      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        container.scrollBy({ top: step, behavior: "smooth" });
      } else if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        container.scrollBy({ top: -step, behavior: "smooth" });
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (shorts.length === 0) {
    return (
      <div className="relative flex flex-col items-center justify-center h-dvh text-center px-6 gap-2">
        <SearchButton className="fixed top-4 right-4 md:top-6 md:right-6 z-20" />
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
      className="relative h-dvh w-full overflow-y-scroll snap-y snap-mandatory no-scrollbar bg-bg"
    >
      <SearchButton className="fixed top-4 right-4 md:top-6 md:right-6 z-20" />
      <div aria-hidden style={{ height: edgeSpacer }} />
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
            className={cn(
              // snap-always (scroll-snap-stop: always) is the actual fix
              // for "swipe feels rough" — without it, a fast/hard swipe
              // flings straight past the next tile to whichever one
              // momentum happens to land on, skipping 2-3 at once
              // unpredictably. This forces the browser to stop at every
              // tile regardless of fling speed, so one swipe always moves
              // exactly one short — the standard fix for erratic-feeling
              // snap-scroll. Longer, gentler crossfade on top (was 300ms
              // ease-out) so the focus/blur handoff itself doesn't feel
              // like a hard cut mid-scroll.
              "relative aspect-video w-full max-w-[720px] mx-auto overflow-hidden bg-card snap-center snap-always transition-[opacity,filter] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
              active ? "opacity-100 blur-none" : "opacity-50 blur-sm"
            )}
          >
            {withinRenderWindow ? (
              <video
                ref={(el) => {
                  videoRefs.current[index] = el;
                }}
                src={short.playbackUrl}
                poster={short.posterUrl}
                className="w-full h-full object-cover"
                muted
                loop
                playsInline
              />
            ) : (
              <Image src={short.posterUrl} alt="" fill className="object-cover" />
            )}

            {active && (
              <div className="absolute inset-x-0 bottom-0 p-4">
                <p className="text-sm font-semibold">@{short.creator.username}</p>
                <p className="text-xs text-text-secondary truncate">{short.title}</p>
              </div>
            )}
          </div>
        );
      })}
      {/* Same edgeSpacer as the leading one — centers the *last* tile at
          rest too, not just guarantees scroll room past it (which a
          same-size fixed spacer does either way; with only a handful of
          shorts their combined height can end up shorter than the viewport
          itself, leaving nothing to actually scroll — confirmed: exactly
          what happened with 3 demo shorts and no spacer at all). */}
      <div aria-hidden style={{ height: edgeSpacer }} />

      {/* Fixed to the viewport, not nested in the active tile — the tile is
          only ~220px tall at typical phone widths (a true 16:9 box), well
          under the rail's own stacked height (avatar/follow, like, comment,
          share, save, more), and the tile's overflow-hidden was clipping it
          when it lived inline. This also means it doesn't need to migrate
          tile-to-tile as activeIndex changes — it just points at whichever
          short is active. */}
      {shorts[activeIndex] && (
        <>
          <AnimatePresence>
            {showActions && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="fixed right-4 bottom-24 md:right-6 md:bottom-10 z-30"
              >
                <ActionRail
                  video={shorts[activeIndex]}
                  onOpenComments={() => setCommentsOpen(true)}
                  onOpenOptions={() => setOptionsOpen(true)}
                />
              </motion.div>
            )}
          </AnimatePresence>
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
