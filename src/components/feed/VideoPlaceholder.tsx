import { forwardRef } from "react";
import Image from "next/image";
import type { Video } from "@/lib/types";

/** Stands in for a VideoCard outside the render window (see SwipeFeed's
 * virtualization) — same height and the same blurred-poster backdrop, so a
 * fast fling through the feed still looks visually continuous, but with none
 * of a real VideoCard's cost: no <video> element (no decode/network/audio),
 * no Framer Motion instances, no comment/options/details sheets mounted. */
export const VideoPlaceholder = forwardRef<
  HTMLElement,
  { video: Video; index: number }
>(function VideoPlaceholder({ video, index }, ref) {
  return (
    <section
      ref={ref}
      data-index={index}
      className="relative h-dvh w-full snap-start snap-always overflow-hidden bg-bg"
    >
      <Image
        src={video.posterUrl}
        alt=""
        fill
        className="object-cover scale-125 blur-3xl opacity-40"
      />
    </section>
  );
});
