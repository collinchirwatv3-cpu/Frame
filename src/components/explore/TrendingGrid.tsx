import Image from "next/image";
import Link from "next/link";
import { Eye, Play } from "lucide-react";
import { BadgeRow } from "@/components/ui/BadgeRow";
import { computeBadges } from "@/lib/badges";
import { formatCount } from "@/lib/utils";
import type { Video } from "@/lib/types";

export function TrendingGrid({
  videos,
  emptyState,
}: {
  videos: Video[];
  emptyState?: React.ReactNode;
}) {
  if (videos.length === 0) {
    return (
      emptyState ?? (
        <p className="text-center text-text-secondary text-sm py-16">
          Nothing here yet — try another filter.
        </p>
      )
    );
  }

  return (
    <div className="columns-2 md:columns-3 lg:columns-4 gap-3 px-6">
      {videos.map((video) => (
        <Link
          key={video.id}
          href={`/?v=${video.id}`}
          aria-label={`Watch ${video.title} by @${video.creator.username}`}
          style={{ aspectRatio: `${video.width} / ${video.height}` }}
          className="group relative block rounded-xl overflow-hidden bg-card border border-border text-left mb-3 break-inside-avoid"
        >
          <Image
            src={video.posterUrl}
            alt={video.title}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-bg/85 via-transparent to-transparent" />
          <Play
            size={28}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-accent opacity-0 group-hover:opacity-100 transition-opacity"
            fill="currentColor"
          />
          <BadgeRow badges={computeBadges(video)} max={1} className="absolute top-2 left-2" />
          <div className="absolute bottom-0 inset-x-0 p-2.5">
            <p className="text-xs font-semibold truncate">{video.title}</p>
            <div className="flex items-center gap-1 text-[11px] text-text-secondary mt-0.5">
              <Eye size={11} />
              {formatCount(video.likes * 6)}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
