import Image from "next/image";
import Link from "next/link";
import { BadgeRow } from "@/components/ui/BadgeRow";
import { computeBadges } from "@/lib/badges";
import { cn } from "@/lib/utils";
import type { Video } from "@/lib/types";

export function VideoRail({
  title,
  videos,
  size = "default",
}: {
  title: string;
  videos: Video[];
  size?: "default" | "large";
}) {
  if (videos.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold px-6">{title}</h2>
      <div className="flex gap-3 overflow-x-auto no-scrollbar px-6 pb-1">
        {videos.map((video) => (
          <Link
            key={video.id}
            href={`/?v=${video.id}`}
            aria-label={`Watch ${video.title} by @${video.creator.username}`}
            style={{ aspectRatio: `${video.width} / ${video.height}` }}
            className={cn(
              "group relative shrink-0 rounded-xl overflow-hidden bg-card border border-border",
              size === "large" ? "w-72" : "w-48"
            )}
          >
            <Image
              src={video.posterUrl}
              alt={video.title}
              fill
              className="object-cover transition-transform duration-300 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-bg/85 via-transparent to-transparent" />
            <BadgeRow badges={computeBadges(video)} max={1} className="absolute top-2 left-2" />
            <div className="absolute bottom-0 inset-x-0 p-2.5">
              <p className="text-xs font-semibold truncate">{video.title}</p>
              <p className="text-[11px] text-text-secondary truncate">
                @{video.creator.username}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
