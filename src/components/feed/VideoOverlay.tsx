"use client";

import { Music2 } from "lucide-react";
import { BadgeRow } from "@/components/ui/BadgeRow";
import { computeBadges } from "@/lib/badges";
import type { Video } from "@/lib/types";

export function VideoOverlay({
  video,
  onOpenDetails,
}: {
  video: Video;
  onOpenDetails: () => void;
}) {
  return (
    <div className="max-w-[75%] flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <span className="font-bold text-[15px]">@{video.creator.username}</span>
        <span className="text-xs text-text-secondary">{video.category}</span>
      </div>
      <BadgeRow badges={computeBadges(video)} />
      <button onClick={onOpenDetails} className="text-left">
        <p className="text-sm leading-snug text-accent/95 line-clamp-2">{video.description}</p>
        <span className="text-[11px] text-text-secondary underline underline-offset-2 decoration-text-secondary/40">
          Shot details
        </span>
      </button>
      {video.soundName && (
        <div className="flex items-center gap-1.5 mt-1 text-xs text-accent/90">
          <Music2 size={13} />
          <span className="truncate">{video.soundName}</span>
        </div>
      )}
    </div>
  );
}
