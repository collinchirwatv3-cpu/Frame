"use client";

import { useState } from "react";
import Image from "next/image";
import { Link2, Lock } from "lucide-react";
import { CreateShareLinkSheet } from "./CreateShareLinkSheet";
import { useShareLinksStore } from "@/store/share-links-store";
import { getShareLinkStatus } from "@/lib/share-links";
import type { Video } from "@/lib/types";

export function PrivateVideoList({ videos }: { videos: Video[] }) {
  const [activeVideo, setActiveVideo] = useState<Video | null>(null);
  const links = useShareLinksStore((s) => s.links);

  if (videos.length === 0) {
    return (
      <p className="text-center text-text-secondary text-sm py-16">
        Nothing private yet. Rough cuts and client previews you&apos;re not ready to post
        publicly can live here.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3 px-6">
      {videos.map((video) => {
        const activeCount = links.filter(
          (l) => l.videoId === video.id && getShareLinkStatus(l) === "active"
        ).length;

        return (
          <div
            key={video.id}
            className="flex items-center gap-3 bg-card border border-border rounded-xl p-3"
          >
            <div
              className="relative w-24 shrink-0 rounded-lg overflow-hidden bg-bg"
              style={{ aspectRatio: `${video.width} / ${video.height}` }}
            >
              <Image src={video.posterUrl} alt={video.title} fill className="object-cover" />
              <span className="absolute top-1 left-1 w-5 h-5 rounded-full bg-bg/80 flex items-center justify-center">
                <Lock size={10} />
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{video.title}</p>
              <p className="text-xs text-text-secondary line-clamp-2 mt-0.5">
                {video.description}
              </p>
              {activeCount > 0 && (
                <p className="text-[11px] text-primary font-medium mt-1">
                  {activeCount} active link{activeCount > 1 ? "s" : ""}
                </p>
              )}
            </div>
            <button
              onClick={() => setActiveVideo(video)}
              aria-label={`Share ${video.title}`}
              className="w-9 h-9 rounded-full bg-bg flex items-center justify-center shrink-0"
            >
              <Link2 size={15} className="text-primary" />
            </button>
          </div>
        );
      })}

      {activeVideo && (
        <CreateShareLinkSheet
          video={activeVideo}
          open={activeVideo !== null}
          onClose={() => setActiveVideo(null)}
        />
      )}
    </div>
  );
}
