"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Music2 } from "lucide-react";
import { BadgeRow } from "@/components/ui/BadgeRow";
import { computeBadges } from "@/lib/badges";
import { useEngagementStore } from "@/store/engagement-store";
import { DURATION } from "@/lib/motion";
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
      <div className="flex items-center gap-2">
        <span className="font-bold text-[15px]">@{video.creator.username}</span>
        <span className="text-xs text-text-secondary">{video.category}</span>
        {/* Moved here from ActionRail's avatar (was a pill underneath it in
            the right-side rail) — reads more naturally sitting right next to
            the name it's about, rather than off in the action rail. */}
        <AnimatePresence>
          {!following && (
            <motion.button
              key="follow"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: DURATION.fast }}
              onClick={(e) => {
                e.stopPropagation();
                toggleFollow(video.creator.id);
              }}
              aria-label={`Follow @${video.creator.username}`}
              className="px-2.5 py-1 rounded-full bg-card/80 backdrop-blur-md border border-border text-[10px] font-semibold text-accent shrink-0"
            >
              Follow
            </motion.button>
          )}
        </AnimatePresence>
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
