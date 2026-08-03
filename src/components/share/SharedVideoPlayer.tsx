"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Volume2, VolumeX } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { Avatar } from "@/components/ui/Avatar";
import type { Video } from "@/lib/types";

export function SharedVideoPlayer({ video }: { video: Video }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    videoRef.current?.play().catch(() => {});
  }, []);

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-bg">
      <div className="absolute inset-0">
        <Image src={video.posterUrl} alt="" fill className="object-cover scale-125 blur-3xl opacity-40" />
      </div>

      <div className="absolute inset-0 flex items-center justify-center">
        <video
          ref={videoRef}
          src={video.playbackUrl}
          poster={video.posterUrl}
          className="w-full h-full object-contain"
          muted={muted}
          loop
          playsInline
          controls
        />
      </div>

      <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-bg/90 via-bg/30 to-transparent pointer-events-none" />

      <div className="absolute top-4 left-4 md:top-6 md:left-6 flex items-center gap-2">
        <Logo size={28} />
        <span className="text-sm font-bold tracking-tight drop-shadow-sm">FRAME</span>
      </div>

      <button
        onClick={() => setMuted((m) => !m)}
        aria-label={muted ? "Unmute" : "Mute"}
        className="absolute top-4 right-4 md:top-6 md:right-6 w-9 h-9 rounded-full bg-card/70 backdrop-blur-md flex items-center justify-center"
      >
        {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
      </button>

      <div className="absolute inset-x-0 bottom-0 px-4 md:px-8 pb-6 md:pb-10 flex flex-col gap-3 max-w-lg">
        <div className="flex items-center gap-2">
          <Avatar src={video.creator.avatarUrl} alt={video.creator.displayName} size={32} />
          <div>
            <p className="text-sm font-semibold">@{video.creator.username}</p>
            <p className="text-xs text-text-secondary">shared this privately with you</p>
          </div>
        </div>
        <p className="text-sm text-accent/90">{video.title}</p>
        <Link
          href="/login"
          className="self-start px-4 py-2 rounded-full bg-primary text-bg text-xs font-semibold"
        >
          Get FRAME to watch more
        </Link>
      </div>
    </div>
  );
}
