"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bookmark, Check, Heart, Link2, MessageCircle, MoreHorizontal, Scissors, Share2 } from "lucide-react";
import { cn, formatCount, shareContent } from "@/lib/utils";
import { DURATION } from "@/lib/motion";
import { CHROME_GLASS_CLASS, CHROME_TAP_SCALE } from "@/lib/chrome";
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
  compact,
}: {
  icon: React.ElementType;
  label: string;
  srLabel: string;
  active?: boolean;
  activeColor?: string;
  filled?: boolean;
  pulseKey?: number;
  onClick?: () => void;
  /** Shrinks the circle/icon and drops the count label entirely so the
   * whole rail fits inside a short 16:9 video band (Shorts) instead of the
   * default size tuned for the main feed's full-height player — even a
   * tiny label was still too tall to fit six stacked items in ~220px. The
   * count is still announced via srLabel/aria-pressed for screen readers. */
  compact?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn("flex flex-col items-center group", compact ? "gap-0" : "gap-0.5")}
      aria-pressed={active}
      aria-label={compact ? `${srLabel} (${label})` : srLabel}
    >
      <motion.span
        key={pulseKey}
        whileTap={{ scale: CHROME_TAP_SCALE }}
        initial={pulseKey ? { scale: 1 } : false}
        animate={pulseKey ? { scale: [1, 1.18, 1] } : undefined}
        transition={{ duration: DURATION.base }}
        className={cn(
          CHROME_GLASS_CLASS,
          "flex items-center justify-center group-hover:bg-card transition-colors",
          compact ? "w-10 h-10" : "w-11 h-11"
        )}
      >
        <Icon
          size={compact ? 20 : 22}
          strokeWidth={2}
          style={active ? { color: activeColor } : undefined}
          fill={active && filled ? activeColor : "none"}
          className={cn(!active && "text-accent")}
        />
      </motion.span>
      {!compact && (
        <span className="text-[11px] font-medium text-text-secondary" aria-hidden="true">
          {label}
        </span>
      )}
    </button>
  );
}

export function ActionRail({
  video,
  onOpenComments,
  onOpenOptions,
  onOpenClip,
  className,
  compact,
}: {
  video: Video;
  onOpenComments: () => void;
  onOpenOptions: () => void;
  /** Optional — Shorts (compact rail, already-short clips) doesn't wire
   * this up at all, so the button simply doesn't render there. */
  onOpenClip?: () => void;
  /** Overrides the root's flex direction/gap — Shorts uses this to lay the
   * rail out as a row instead of a column in landscape, the main feed
   * leaves it at the default column (its cinematic player keeps a vertical
   * control column even in landscape, per RotateDevicePrompt). */
  className?: string;
  /** Shrinks every icon/label and tightens the gaps — Shorts uses this so
   * the whole rail fits inside its own 16:9 video band instead of
   * spilling into the black letterboxing above/below it. */
  compact?: boolean;
}) {
  const liked = useEngagementStore((s) => !!s.likedVideos[video.id]);
  const saved = useEngagementStore((s) => !!s.savedVideos[video.id]);
  const toggleLike = useEngagementStore((s) => s.toggleLike);
  const toggleSave = useEngagementStore((s) => s.toggleSave);
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
    <div className={cn("flex flex-col items-center", compact ? "gap-1.5" : "gap-5", className)}>
      {/* Follow used to be a pill under an avatar that used to sit here —
          moved to next to the username in VideoOverlay.tsx instead, reads
          more naturally next to the name it's actually about. The avatar
          itself was dropped entirely (not just moved): both feeds render
          the creator's avatar in their caption now, and this rail's own
          copy was a second, fully redundant one right next to it — most
          visible on wider screens (iPad) where caption and rail sit far
          enough apart to read as "two different profile pictures," not one
          moved thing. */}
      <RailButton
        icon={Heart}
        label={formatCount(likeCount)}
        srLabel={liked ? "Unlike" : "Like"}
        active={liked}
        filled
        pulseKey={likePulse}
        onClick={handleLike}
        compact={compact}
      />
      <RailButton
        icon={MessageCircle}
        label={formatCount(commentCount)}
        srLabel="View comments"
        onClick={onOpenComments}
        compact={compact}
      />
      <div className="relative">
        <RailButton
          icon={shareState === "done" ? Check : Share2}
          label={formatCount(video.shares)}
          srLabel="Share"
          active={shareState === "done"}
          activeColor="var(--color-accent)"
          onClick={handleShare}
          compact={compact}
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
        compact={compact}
      />
      {onOpenClip && (
        <RailButton icon={Scissors} label="Clip" srLabel="Create a clip" onClick={onOpenClip} compact={compact} />
      )}

      <motion.button
        whileTap={{ scale: CHROME_TAP_SCALE }}
        onClick={onOpenOptions}
        aria-label="More options"
        className={cn(
          CHROME_GLASS_CLASS,
          "flex items-center justify-center hover:bg-card transition-colors",
          compact ? "w-10 h-10" : "w-11 h-11"
        )}
      >
        <MoreHorizontal size={compact ? 20 : 22} className="text-accent" />
      </motion.button>
    </div>
  );
}
