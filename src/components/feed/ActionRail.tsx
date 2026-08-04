"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bookmark, Check, Heart, Link2, MessageCircle, MoreHorizontal, Share2 } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { cn, formatCount, shareContent } from "@/lib/utils";
import { DURATION } from "@/lib/motion";
import { useEngagementStore } from "@/store/engagement-store";
import { useCommentsStore } from "@/store/comments-store";
import type { Video } from "@/lib/types";

function RailButton({
  icon: Icon,
  label,
  srLabel,
  active,
  activeColor = "var(--color-primary)",
  filled,
  pulseKey,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  srLabel: string;
  active?: boolean;
  activeColor?: string;
  filled?: boolean;
  pulseKey?: number;
  onClick?: () => void;
}) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1 group" aria-pressed={active} aria-label={srLabel}>
      <motion.span
        key={pulseKey}
        whileTap={{ scale: 0.8 }}
        initial={pulseKey ? { scale: 1 } : false}
        animate={pulseKey ? { scale: [1, 1.18, 1] } : undefined}
        transition={{ duration: DURATION.base }}
        className="w-11 h-11 rounded-full flex items-center justify-center bg-card/70 backdrop-blur-md group-hover:bg-card transition-colors"
      >
        <Icon
          size={22}
          strokeWidth={2}
          style={active ? { color: activeColor } : undefined}
          fill={active && filled ? activeColor : "none"}
          className={cn(!active && "text-accent")}
        />
      </motion.span>
      <span className="text-[11px] font-medium text-text-secondary" aria-hidden="true">
        {label}
      </span>
    </button>
  );
}

export function ActionRail({
  video,
  onOpenComments,
  onOpenOptions,
}: {
  video: Video;
  onOpenComments: () => void;
  onOpenOptions: () => void;
}) {
  const liked = useEngagementStore((s) => !!s.likedVideos[video.id]);
  const saved = useEngagementStore((s) => !!s.savedVideos[video.id]);
  const following = useEngagementStore((s) => !!s.followedCreators[video.creator.id]);
  const toggleLike = useEngagementStore((s) => s.toggleLike);
  const toggleSave = useEngagementStore((s) => s.toggleSave);
  const toggleFollow = useEngagementStore((s) => s.toggleFollow);
  const fetchComments = useCommentsStore((s) => s.fetchComments);
  const liveCommentCount = useCommentsStore((s) => s.byVideoId[video.id]?.length ?? 0);

  useEffect(() => {
    fetchComments(video.id);
  }, [video.id, fetchComments]);

  const [likePulse, setLikePulse] = useState(0);
  const [shareState, setShareState] = useState<"idle" | "done">("idle");

  const likeCount = video.likes + (liked ? 1 : 0);
  const commentCount = video.comments + liveCommentCount;

  function handleLike() {
    toggleLike(video.id);
    if (!liked) setLikePulse((p) => p + 1);
  }

  async function handleShare() {
    // /watch/[id], not the internal /?v= deep link — it has real generateMetadata +
    // opengraph-image so the link unfurls as a branded card in iMessage/Slack/etc.
    const url = `${window.location.origin}/watch/${video.id}`;
    const result = await shareContent({ title: video.title, text: video.description, url });
    if (result === "shared" || result === "copied") {
      setShareState("done");
      window.setTimeout(() => setShareState("idle"), 1600);
    }
  }

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="flex flex-col items-center gap-1.5">
        <Avatar src={video.creator.avatarUrl} alt={video.creator.displayName} size={44} ring />
        <AnimatePresence>
          {!following && (
            <motion.button
              key="follow"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: DURATION.fast }}
              onClick={() => toggleFollow(video.creator.id)}
              aria-label={`Follow @${video.creator.username}`}
              className="px-2.5 py-1 rounded-full bg-card/80 backdrop-blur-md border border-border text-[10px] font-semibold text-accent"
            >
              Follow
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      <RailButton
        icon={Heart}
        label={formatCount(likeCount)}
        srLabel={liked ? "Unlike" : "Like"}
        active={liked}
        filled
        pulseKey={likePulse}
        onClick={handleLike}
      />
      <RailButton
        icon={MessageCircle}
        label={formatCount(commentCount)}
        srLabel="View comments"
        onClick={onOpenComments}
      />
      <div className="relative">
        <RailButton
          icon={shareState === "done" ? Check : Share2}
          label={formatCount(video.shares)}
          srLabel="Share"
          active={shareState === "done"}
          activeColor="var(--color-accent)"
          onClick={handleShare}
        />
        <AnimatePresence>
          {shareState === "done" && (
            <motion.span
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className="absolute right-full top-2 mr-2 whitespace-nowrap text-xs font-medium bg-card px-2.5 py-1 rounded-full flex items-center gap-1"
            >
              <Link2 size={11} /> Link copied
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      <RailButton
        icon={Bookmark}
        label={formatCount(video.saves + (saved ? 1 : 0))}
        srLabel={saved ? "Remove from saved" : "Save"}
        active={saved}
        activeColor="var(--color-accent)"
        filled
        onClick={() => toggleSave(video.id)}
      />

      <button
        onClick={onOpenOptions}
        aria-label="More options"
        className="w-11 h-11 rounded-full flex items-center justify-center bg-card/70 backdrop-blur-md hover:bg-card transition-colors"
      >
        <MoreHorizontal size={22} className="text-accent" />
      </button>
    </div>
  );
}
