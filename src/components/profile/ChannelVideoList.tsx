import Image from "next/image";
import Link from "next/link";
import { AlertTriangle, Film, Loader2, UploadCloud } from "lucide-react";
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
      className="relative rounded-xl overflow-hidden bg-card border border-dashed border-border flex flex-col items-center justify-center gap-2 p-4 text-center"
    >
      {failed ? (
        <AlertTriangle size={20} className="text-primary" />
      ) : (
        <Loader2 size={20} className="animate-spin text-text-secondary" />
      )}
      <p className="text-sm font-semibold truncate max-w-full">{video.title}</p>
      <p className={failed ? "text-xs text-primary" : "text-xs text-text-secondary"}>
        {STATUS_COPY[video.status]}
      </p>
    </div>
  );
}

const RECENT_UPLOAD_WINDOW_MS = 48 * 60 * 60 * 1000;

// A named helper, not a bare Date.now() inline in the render body — this
// repo's lint config (React Compiler's purity rule) flags a raw impure call
// written directly in a component, same reason formatRelativeTime (lib/utils.ts)
// wraps its own Date.now() the same way.
function isRecentUpload(createdAt: string): boolean {
  return Date.now() - new Date(createdAt).getTime() < RECENT_UPLOAD_WINDOW_MS;
}

function ReadyCard({ video, isRecentUpload }: { video: Video; isRecentUpload: boolean }) {
  return (
    <Link
      // /watch/[id], not /?v= — Home is a curated feed now, not "every
      // video," so an older upload from your own back-catalog frequently
      // isn't in it; /?v= would silently open whatever else is first in
      // Home instead of this video, with no visible error.
      href={`/watch/${video.id}`}
      aria-label={`Watch ${video.title}`}
      className="block"
    >
      <div
        style={{ aspectRatio: `${video.width} / ${video.height}` }}
        className="relative rounded-xl overflow-hidden bg-card border border-border"
      >
        <Image src={video.posterUrl} alt={video.title} fill className="object-cover" />
        {isRecentUpload && (
          <span className="absolute top-2.5 left-2.5 flex items-center gap-1 text-[10px] font-bold tracking-wide bg-primary text-bg rounded-full px-2 py-1">
            <UploadCloud size={10} />
            UPLOAD
          </span>
        )}
      </div>
      <div className="pt-2.5">
        <p className="font-semibold text-[15px] leading-snug line-clamp-2">{video.title}</p>
        <p className="text-xs text-text-secondary mt-0.5">
          {video.creator.displayName}
          {video.views !== undefined && ` · ${formatCount(video.views)} views`}
        </p>
        {video.description && (
          <p className="text-sm text-accent/90 line-clamp-2 mt-1">{video.description}</p>
        )}
      </div>
    </Link>
  );
}

/** The owner's own "Channel" tab — like TrendingGrid, but shows every video
 * they own (including in-flight uploads, with status) and a single-column
 * list (title/creator/views/description each get real room, rather than a
 * compact grid tile) matching the reference design's own Channel layout.
 * Only ever rendered for the signed-in user's own profile. */
export function ChannelVideoList({ videos, creator }: { videos: OwnVideo[]; creator: Video["creator"] }) {
  if (videos.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 text-center py-16 px-6">
        <span className="w-12 h-12 rounded-full bg-card border border-border flex items-center justify-center">
          <Film size={20} className="text-text-secondary" />
        </span>
        <p className="text-sm font-medium">Nothing uploaded yet</p>
        <p className="text-xs text-text-secondary max-w-[220px]">
          Your public Frames will show up here once you publish your first one.
        </p>
        <Link
          href="/upload"
          className="mt-1 flex items-center gap-1.5 px-4 py-2 rounded-full bg-primary text-bg text-xs font-semibold"
        >
          <UploadCloud size={13} />
          Upload a Frame
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 px-6">
      {videos.map((video) => {
        const displayVideo = toDisplayVideo(video, creator);
        if (!displayVideo) return <InProgressCard key={video.id} video={video} />;
        return <ReadyCard key={video.id} video={displayVideo} isRecentUpload={isRecentUpload(video.createdAt)} />;
      })}
    </div>
  );
}
