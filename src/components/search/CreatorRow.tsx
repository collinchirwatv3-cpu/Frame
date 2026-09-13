import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { formatCount } from "@/lib/utils";
import type { Creator } from "@/lib/types";

/** Horizontal row of top creators by view count — Search's replacement for
 * the old "Accounts" vertical list, which only ever showed creators whose
 * name happened to match the current text query. This is a real, always-
 * visible browse surface, not search-result filtering. */
export function CreatorRow({ creators }: { creators: Creator[] }) {
  if (creators.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <span className="text-xs font-semibold uppercase tracking-wide text-text-secondary px-6">Frame Creators</span>
      <div className="flex gap-4 overflow-x-auto px-6 pb-1 no-scrollbar">
        {creators.map((creator) => (
          <Link
            key={creator.id}
            href={`/profile/${creator.username}`}
            className="flex flex-col items-center gap-1.5 shrink-0 w-16 text-center"
          >
            <Avatar src={creator.avatarUrl} alt={creator.displayName} size={56} verified={creator.verified} />
            <p className="text-xs font-medium truncate w-full">{creator.displayName}</p>
            <p className="text-[10px] text-text-secondary truncate w-full">
              {formatCount(creator.totalViews)} views
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
