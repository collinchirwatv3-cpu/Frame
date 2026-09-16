"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { Music2 } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { BadgeRow } from "@/components/ui/BadgeRow";
import { computeBadges } from "@/lib/badges";
import { useEngagementStore } from "@/store/engagement-store";
import { useCurrentUserStore } from "@/store/current-user-store";
import { useTagsStore, selectVideoTagTiers } from "@/store/tags-store";
import { CHROME_TAP_SCALE } from "@/lib/chrome";
import { cn, formatCount } from "@/lib/utils";
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
  const ownProfileId = useCurrentUserStore((s) => s.profile?.id);
  const isOwnVideo = ownProfileId === video.creator.id;
  const tagEpoch = useTagsStore((s) => s.epoch);
  const fetchVideoTagTiers = useTagsStore((s) => s.fetchVideoTagTiers);
  const { primary } = useTagsStore(selectVideoTagTiers(video.id));

  // Fetches once per video id (fetchVideoTagTiers no-ops if already
  // cached/in-flight — see tags-store.ts) — VideoDetailsSheet only fetches
  // when opened, but the primary chip here needs to show immediately.
  useEffect(() => {
    fetchVideoTagTiers(video.id);
  }, [video.id, fetchVideoTagTiers, tagEpoch]);

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
            pill here. Hidden entirely on your own video: the database's
            own no_self_follow check constraint already rejects the write,
            so tapping it used to just flash "Following" and silently
            revert once that rejection came back — offering an action
            that's guaranteed to fail isn't a real affordance. */}
        {!isOwnVideo && (
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
        )}
      </div>
      {primary.length > 0 && (
        <span className="text-[11px] font-semibold uppercase tracking-wide text-accent/80 w-fit">
          {primary[0].name}
        </span>
      )}
      <BadgeRow badges={computeBadges(video)} />
      {/* Title wasn't shown anywhere in this overlay before — only in
          VideoDetailsSheet and the Discover/Home shelf grids. Kept "Shot
          details" as the tap label rather than "View full video": this
          genuinely opens camera/lens/tags details, not a separate full
          video — this app's Community Clips feature already owns that
          language for the one place it actually applies. views is real now
          (record_video_view / videos.view_count), shown only when present
          since mock-data/pre-migration fixtures don't have it — no fake
          always-zero stat, same principle as before, now with real data
          instead of an omission. */}
      <button onClick={onOpenDetails} className="text-left">
        <h2 className="font-bold text-lg leading-snug">{video.title}</h2>
        {video.views !== undefined && (
          <p className="text-xs text-text-secondary mt-0.5">{formatCount(video.views)} views</p>
        )}
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
