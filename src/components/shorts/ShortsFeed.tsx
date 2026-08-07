"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { SearchButton } from "@/components/ui/SearchButton";
import type { Video } from "@/lib/types";

// Real <video> elements are mounted only this close to the active short —
// same reasoning as SwipeFeed's RENDER_WINDOW, just a smaller window since
// shorts are lighter-weight (no Director Mode chrome, no action rail).
const RENDER_WINDOW = 1;

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
  const visibilityRef = useRef<Map<number, number>>(new Map());

  // Jump straight to the deep-linked short before paint — no flash of index 0.
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

    // IntersectionObserver callbacks are incremental — a given invocation
    // only carries entries whose ratio just crossed one of `threshold`,
    // not a full snapshot of every observed element. Cards are short
    // enough now (true 16:9, not the old near-full-height portrait ones)
    // that comparing only *this callback's* entries against each other
    // isn't enough: the section that's actually most visible right now
    // might not even be in this particular batch, since its own ratio
    // hasn't changed recently. Track every section's latest known ratio
    // persistently instead, and pick the max across all of them on every
    // update — not just whichever happened to fire this time.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const index = Number((entry.target as HTMLElement).dataset.index);
          visibilityRef.current.set(index, entry.intersectionRatio);
        }
        let bestIndex = 0;
        let bestRatio = -1;
        for (const [index, ratio] of visibilityRef.current) {
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestIndex = index;
          }
        }
        setActiveIndex(bestIndex);
      },
      { root: container, threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1] }
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
              "relative aspect-video w-full max-w-[720px] mx-auto overflow-hidden bg-card snap-center transition-[opacity,filter] duration-300 ease-out",
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
              <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-bg/90 via-bg/30 to-transparent">
                <p className="text-sm font-semibold">@{short.creator.username}</p>
                <p className="text-xs text-text-secondary truncate">{short.title}</p>
              </div>
            )}
          </div>
        );
      })}
      {/* Tiles are uniform-height 16:9 boxes now, not the old near-full-
          screen ones — with only a handful of shorts, their combined height
          can end up shorter than the viewport itself, leaving nothing to
          actually scroll (confirmed: exactly what happened with 3 demo
          shorts). This trailing spacer guarantees real scroll room past the
          last tile regardless of how many shorts exist, without adding any
          gap between the tiles themselves. */}
      <div aria-hidden className="h-[60dvh]" />
    </div>
  );
}
