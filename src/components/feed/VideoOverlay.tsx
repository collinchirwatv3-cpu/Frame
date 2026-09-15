"use client";

import { motion } from "framer-motion";
import { Music2 } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { BadgeRow } from "@/components/ui/BadgeRow";
import { computeBadges } from "@/lib/badges";
import { useEngagementStore } from "@/store/engagement-store";
import { CHROME_TAP_SCALE } from "@/lib/chrome";
import { cn } from "@/lib/utils";
import type { Video } from "@/lib/types";

export function VideoOverlay({
  video,
  onOpenDetails,
}: {
  video: Video;
  onOpenDetails: () => void;
}) {
  const following = useEngagementStore((s) => !!s.followedCreators[video.creator.id]);
  const toggleFollow = useEngagementStore((s) => s.toggleFollow);

  return (
    <div className="max-w-[75%] flex flex-col gap-2">
      <div className="flex items-center gap-2.5">
        <Avatar src={video.creator.avatarUrl} alt={video.creator.displayName} size={36} ring />
        <div className="min-w-0">
          <p className="font-bold text-[15px] leading-tight truncate">{video.creator.displayName}</p>
          <p className="text-xs text-text-secondary leading-tight truncate">@{video.creator.username}</p>
        </div>
        {/* Moved here from ActionRail's avatar (was the top item in the
            right-side rail) — reads more naturally sitting right next to
            the name it's about. Stays visible once followed (relabeled,
            dimmed) rather than disappearing — same "Follow" -> "Following"
            convention ProfileHeader.tsx already uses, just as a compact
            pill here. */}
        <motion.button
          whileTap={{ scale: CHROME_TAP_SCALE }}
          onClick={(e) => {
            e.stopPropagation();
            toggleFollow(video.creator.id);
          }}
          aria-label={following ? `Unfollow @${video.creator.username}` : `Follow @${video.creator.username}`}
          className={cn(
            "px-2.5 py-1 rounded-full backdrop-blur-md border text-[10px] font-semibold shrink-0 transition-colors",
            following
              ? "bg-card/50 border-border text-text-secondary"
              : "bg-card/80 border-border text-accent"
          )}
        >
          {following ? "Following" : "Follow"}
        </motion.button>
      </div>
      <BadgeRow badges={computeBadges(video)} />
      {/* Title wasn't shown anywhere in this overlay before — only in
          VideoDetailsSheet and the Discover/Home shelf grids. Kept
          "Shot details" as the tap label rather than "View full video":
          this genuinely opens camera/lens/tags details, not a separate
          full video, and this app has no video.views stat to show either
          (videos.view_count exists but nothing increments it — see
          Video.createdAt's own doc comment in lib/types.ts; showing a
          number here would just be a fake always-zero stat). */}
      <button onClick={onOpenDetails} className="text-left">
        <h2 className="font-bold text-lg leading-snug">{video.title}</h2>
        {video.description && (
          <p className="text-sm leading-snug text-accent/95 line-clamp-2 mt-0.5">{video.description}</p>
        )}
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
