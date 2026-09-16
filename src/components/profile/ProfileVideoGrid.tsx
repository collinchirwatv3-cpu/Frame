import Image from "next/image";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import type { Video } from "@/lib/types";

/** A plain grid of already-resolved Video rows — used by Saved/History,
 * whose fetch functions (fetchSavedVideos/fetchHistoryVideos) already
 * return full playable Video objects, unlike ChannelVideoList's OwnVideo
 * (which also tracks in-flight/failed uploads). Same grid-item visual
 * shape already used on Search's results grid and the public [username]
 * profile grid. */
export function ProfileVideoGrid({
  videos,
  emptyIcon: Icon,
  emptyHeading,
  emptySubtext,
}: {
  videos: Video[];
  emptyIcon: LucideIcon;
  emptyHeading: string;
  emptySubtext: string;
}) {
  if (videos.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 text-center py-16 px-6">
        <span className="w-12 h-12 rounded-full bg-card border border-border flex items-center justify-center">
          <Icon size={20} className="text-text-secondary" />
        </span>
        <p className="text-sm font-medium">{emptyHeading}</p>
        <p className="text-xs text-text-secondary max-w-[220px]">{emptySubtext}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 px-6">
      {videos.map((video) => (
        <Link
          key={video.id}
          href={`/watch/${video.id}`}
          aria-label={`Watch ${video.title}`}
          style={{ aspectRatio: `${video.width} / ${video.height}` }}
          className="group relative block rounded-xl overflow-hidden bg-card border border-border"
        >
          <Image
            src={video.posterUrl}
            alt=""
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-bg/85 via-transparent to-transparent" />
          <div className="absolute bottom-0 inset-x-0 p-2.5">
            <p className="text-xs font-semibold truncate">{video.title}</p>
            <p className="text-[11px] text-text-secondary truncate">@{video.creator.username}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}
