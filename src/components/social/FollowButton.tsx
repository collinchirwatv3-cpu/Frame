"use client";

import { cn } from "@/lib/utils";
import { useEngagementStore } from "@/store/engagement-store";

/** Compact Follow/Following pill for a list row (Followers/Following pages)
 * — same toggleFollow the large ProfileHeader button uses, sized down.
 * Renders nothing for the viewer's own row (no self-follow). */
export function FollowButton({ userId }: { userId: string }) {
  const ownId = useEngagementStore((s) => s.userId);
  const following = useEngagementStore((s) => !!s.followedCreators[userId]);
  const toggleFollow = useEngagementStore((s) => s.toggleFollow);

  if (userId === ownId) return null;

  return (
    <button
      onClick={() => toggleFollow(userId)}
      className={cn(
        "px-4 py-1.5 rounded-full text-xs font-medium shrink-0 transition-colors",
        following
          ? "border border-border hover:bg-card"
          : "bg-primary text-bg font-semibold"
      )}
    >
      {following ? "Following" : "Follow"}
    </button>
  );
}
