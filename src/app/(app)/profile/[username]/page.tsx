"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { ProfileHeader } from "@/components/profile/ProfileHeader";
import { SwipeFeed } from "@/components/feed/SwipeFeed";
import { ShortsFeed } from "@/components/shorts/ShortsFeed";
import { fetchProfileByUsername, fetchCreatorPublicVideos } from "@/lib/video-fetch";
import { useCurrentUserStore } from "@/store/current-user-store";
import type { Creator, Video } from "@/lib/types";

type LoadState = "loading" | "not-found" | "ready";

/**
 * Anyone's public profile — read-only, no edit/settings/inbox access
 * (ProfileHeader's own={false} mode), a Follow button instead. Redirects to
 * /profile if the username belongs to the viewer themself: fetchCreatorPublicVideos
 * relies on RLS to only return public+ready rows, but RLS also lets a
 * creator see their own private/in-progress rows — visiting your own
 * username here would leak those into what's meant to be the public view.
 */
export default function PublicProfilePage() {
  const { username } = useParams<{ username: string }>();
  const router = useRouter();
  const selectedId = useSearchParams().get("v");
  const ownProfile = useCurrentUserStore((s) => s.profile);

  const [state, setState] = useState<LoadState>("loading");
  const [creator, setCreator] = useState<Creator | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);

  useEffect(() => {
    if (ownProfile && ownProfile.username === username) {
      router.replace("/profile");
      return;
    }
    fetchProfileByUsername(username).then(async (c) => {
      if (!c) {
        setState("not-found");
        return;
      }
      setCreator(c);
      setVideos(await fetchCreatorPublicVideos(c.id));
      setState("ready");
    });
  }, [username, ownProfile, router]);

  const films = videos.filter((v) => v.contentType !== "short");
  const shorts = videos.filter((v) => v.contentType === "short");

  if (selectedId) {
    if (shorts.some((v) => v.id === selectedId)) {
      return <ShortsFeed shorts={shorts} initialId={selectedId} />;
    }
    return <SwipeFeed videos={films} showSearchButton={false} />;
  }

  if (state === "loading") {
    return (
      <div className="flex items-center justify-center h-dvh">
        <Loader2 size={28} className="animate-spin text-text-secondary" />
      </div>
    );
  }

  if (state === "not-found" || !creator) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 h-dvh text-center px-6">
        <p className="text-sm font-medium">Couldn&apos;t find @{username}</p>
        <Link href="/discover" className="mt-1 text-xs text-primary underline underline-offset-2">
          Back to Discover
        </Link>
      </div>
    );
  }

  return (
    <div className="pb-24 md:pb-8">
      <ProfileHeader creator={creator} isCreator={false} own={false} />

      <div className="mt-8">
        {videos.length === 0 ? (
          <p className="text-center text-text-secondary text-sm py-16 px-6">
            @{creator.username} hasn&apos;t posted anything yet.
          </p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 px-6">
            {videos.map((video) => (
              <Link
                key={video.id}
                href={`/profile/${username}?v=${video.id}`}
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
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
