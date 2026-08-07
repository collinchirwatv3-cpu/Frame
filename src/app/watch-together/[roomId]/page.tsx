"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { WatchTogetherPlayer } from "@/components/watch-together/WatchTogetherPlayer";
import { fetchVideoById } from "@/lib/watch-together";
import type { Video } from "@/lib/types";

type LoadState = "loading" | "not-found" | "ready";

export default function WatchTogetherPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const searchParams = useSearchParams();
  const videoId = searchParams.get("v");

  const [state, setState] = useState<LoadState>(videoId ? "loading" : "not-found");
  const [video, setVideo] = useState<Video | null>(null);

  useEffect(() => {
    if (!videoId) return;
    fetchVideoById(videoId).then((v) => {
      setVideo(v);
      setState(v ? "ready" : "not-found");
    });
  }, [videoId]);

  if (state === "loading") {
    return (
      <div className="flex items-center justify-center h-dvh bg-bg">
        <Loader2 size={28} className="animate-spin text-text-secondary" />
      </div>
    );
  }

  if (state === "not-found" || !video) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 h-dvh bg-bg text-center px-6">
        <p className="text-sm font-medium">This watch party isn&apos;t available</p>
        <p className="text-xs text-text-secondary max-w-sm">
          The video might have been removed, or the link is missing its video.
        </p>
        <Link href="/discover" className="mt-2 text-xs text-primary underline underline-offset-2">
          Go to FRAMES
        </Link>
      </div>
    );
  }

  return <WatchTogetherPlayer video={video} roomId={roomId} />;
}
