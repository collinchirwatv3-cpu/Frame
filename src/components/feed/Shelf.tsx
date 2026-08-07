import Image from "next/image";
import Link from "next/link";
import { BadgeRow } from "@/components/ui/BadgeRow";
import { computeBadges } from "@/lib/badges";
import type { Video } from "@/lib/types";

export type ShelfKind = "forYou" | "following" | "saved" | "history";

type Props = {
  kind: ShelfKind;
  title: string;
  videos: Video[];
  /** Omit when the caller already guarantees this shelf is never rendered
   * empty (e.g. For You — FeedRoot shows a page-level empty state instead
   * of getting this far when it's empty). */
  emptyMessage?: string;
};

/** One horizontal row of Home — a title plus a scrollable strip of cards,
 * Netflix/YouTube-shelf style, replacing the earlier tabs+full-screen-feed
 * default (see FeedRoot.tsx). Each card links to `/?v=<id>&shelf=<kind>`
 * rather than a bare `/?v=<id>` — FeedRoot needs to know *which* shelf's
 * list a tapped video came from, since each shelf is now its own separate
 * fetch rather than one shared array, and the immersive player it opens
 * into should keep scrolling through that same shelf, not always For You.
 *
 * Fixed card height with the poster's own aspect ratio determining width
 * (not the other way around) — the standard shelf pattern: every row reads
 * at a consistent height regardless of how each film happens to be shaped. */
export function Shelf({ kind, title, videos, emptyMessage }: Props) {
  return (
    <section className="py-3">
      <h2 className="px-6 text-sm font-semibold mb-2.5">{title}</h2>

      {videos.length === 0 ? (
        <p className="px-6 text-xs text-text-secondary">{emptyMessage ?? "Nothing here yet."}</p>
      ) : (
        <div className="flex gap-3 overflow-x-auto no-scrollbar px-6 pb-1">
          {videos.map((video) => (
            <Link
              key={video.id}
              href={`/?v=${video.id}&shelf=${kind}`}
              aria-label={`Watch ${video.title} by @${video.creator.username}`}
              style={{ aspectRatio: `${video.width} / ${video.height}` }}
              className="group relative flex-shrink-0 h-28 md:h-32 rounded-xl overflow-hidden bg-card border border-border"
            >
              <Image
                src={video.posterUrl}
                alt={video.title}
                fill
                sizes="(max-width: 768px) 45vw, 320px"
                className="object-cover transition-transform duration-300 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-bg/85 via-transparent to-transparent" />
              <BadgeRow badges={computeBadges(video)} max={1} className="absolute top-1.5 left-1.5" />
              <div className="absolute bottom-0 inset-x-0 p-2">
                <p className="text-[11px] font-semibold truncate">{video.title}</p>
                <p className="text-[10px] text-text-secondary truncate">
                  @{video.creator.username}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
