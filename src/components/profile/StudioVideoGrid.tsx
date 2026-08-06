import Image from "next/image";
import Link from "next/link";
import { AlertTriangle, Bookmark, Film, Heart, Loader2, MessageCircle, Play, UploadCloud } from "lucide-react";
import { BadgeRow } from "@/components/ui/BadgeRow";
import { computeBadges } from "@/lib/badges";
import { formatCount } from "@/lib/utils";
import { toDisplayVideo, type OwnVideo } from "@/lib/profile-videos";
import type { Video } from "@/lib/types";

const STATUS_COPY: Record<OwnVideo["status"], string> = {
  uploading: "Uploading…",
  processing: "Processing…",
  // Ready but shown here anyway means poster_url hasn't landed yet — same
  // "still finishing up" story as processing, from the creator's view.
  ready: "Processing…",
  failed: "Failed to process",
};

function InProgressCard({ video }: { video: OwnVideo }) {
  const failed = video.status === "failed";
  return (
    <div
      style={{ aspectRatio: `${video.width} / ${video.height}` }}
      className="relative rounded-xl overflow-hidden bg-card border border-dashed border-border mb-3 break-inside-avoid flex flex-col items-center justify-center gap-2 p-4 text-center"
    >
      {failed ? (
        <AlertTriangle size={20} className="text-primary" />
      ) : (
        <Loader2 size={20} className="animate-spin text-text-secondary" />
      )}
      <p className="text-xs font-semibold truncate max-w-full">{video.title}</p>
      <p className={failed ? "text-[11px] text-primary" : "text-[11px] text-text-secondary"}>
        {STATUS_COPY[video.status]}
      </p>
    </div>
  );
}

function ReadyCard({ video }: { video: Video }) {
  return (
    <Link
      // /watch/[id], not /?v= — Home is a curated feed now, not "every
      // video," so an older upload from your own back-catalog frequently
      // isn't in it; /?v= would silently open whatever else is first in
      // Home instead of this video, with no visible error.
      href={`/watch/${video.id}`}
      aria-label={`Watch ${video.title}`}
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
        <div className="flex items-center gap-2.5 text-[11px] text-text-secondary mt-0.5">
          <span className="flex items-center gap-1">
            <Heart size={11} />
            {formatCount(video.likes)}
          </span>
          <span className="flex items-center gap-1">
            <MessageCircle size={11} />
            {formatCount(video.comments)}
          </span>
          <span className="flex items-center gap-1">
            <Bookmark size={11} />
            {formatCount(video.saves)}
          </span>
        </div>
      </div>
    </Link>
  );
}

/** The owner's own "Videos" tab — like TrendingGrid, but shows every video
 * they own (including in-flight uploads, with status) and real engagement
 * counts instead of the public grid's approximate view heuristic. Only ever
 * rendered for the signed-in user's own profile. */
export function StudioVideoGrid({ videos, creator }: { videos: OwnVideo[]; creator: Video["creator"] }) {
  if (videos.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 text-center py-16 px-6">
        <span className="w-12 h-12 rounded-full bg-card border border-border flex items-center justify-center">
          <Film size={20} className="text-text-secondary" />
        </span>
        <p className="text-sm font-medium">Nothing uploaded yet</p>
        <p className="text-xs text-text-secondary max-w-[220px]">
          Your public films will show up here once you publish your first one.
        </p>
        <Link
          href="/upload"
          className="mt-1 flex items-center gap-1.5 px-4 py-2 rounded-full bg-primary text-bg text-xs font-semibold"
        >
          <UploadCloud size={13} />
          Upload a film
        </Link>
      </div>
    );
  }

  return (
    <div className="columns-2 md:columns-3 lg:columns-4 gap-3 px-6">
      {videos.map((video) => {
        const displayVideo = toDisplayVideo(video, creator);
        return displayVideo ? (
          <ReadyCard key={video.id} video={displayVideo} />
        ) : (
          <InProgressCard key={video.id} video={video} />
        );
      })}
    </div>
  );
}
