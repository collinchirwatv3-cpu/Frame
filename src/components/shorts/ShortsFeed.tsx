"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { SearchButton } from "@/components/ui/SearchButton";
import type { Video } from "@/lib/types";

// Real <video> elements are mounted only this close to the active short —
// same reasoning as SwipeFeed's RENDER_WINDOW, just a smaller window since
// shorts are lighter-weight (no Director Mode chrome, no action rail).
const RENDER_WINDOW = 1;

export function ShortsFeed({ shorts }: { shorts: Video[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

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

  useEffect(() => {
    videoRefs.current.forEach((video, index) => {
      if (!video) return;
      if (index === activeIndex) video.play().catch(() => {});
      else video.pause();
    });
  }, [activeIndex]);

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
            className="h-dvh w-full snap-center flex items-center justify-center"
          >
            <div
              className={cn(
                "relative rounded-2xl overflow-hidden bg-card transition-all duration-300 ease-out",
                active
                  ? "w-full max-w-[420px] h-[82%] opacity-100"
                  : "w-[85%] max-w-[370px] h-[66%] opacity-45 scale-[0.96]"
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
          </div>
        );
      })}
    </div>
  );
}
