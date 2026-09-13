"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Search as SearchIcon } from "lucide-react";
import { SwipeFeed } from "@/components/feed/SwipeFeed";
import { ShortsFeed } from "@/components/shorts/ShortsFeed";
import { CreatorRow } from "@/components/search/CreatorRow";
import { FeaturedCollections } from "@/components/search/FeaturedCollections";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import {
  fetchPublicVideos,
  fetchShorts,
  fetchTopCreators,
  fetchFeaturedCollections,
} from "@/lib/video-fetch";
import { matchesVideoQuery } from "@/lib/search";
import type { Collection, Creator, Video } from "@/lib/types";

/** Mirrors the real results grid (grid-cols-2 md:grid-cols-3, aspect-video
 * cards) so loading doesn't reflow into the eventual layout. */
function SearchResultsSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 px-6">
      {Array.from({ length: 9 }).map((_, i) => (
        <Skeleton key={i} className="aspect-video" />
      ))}
    </div>
  );
}

/**
 * The one search surface every page's search icon links to. Covers both
 * films and shorts (fetchPublicVideos + fetchShorts) via client-side
 * matchesVideoQuery filtering, not a server-side search feature. Below the
 * search bar, a Creators row and Featured Collections section are a real
 * browse surface (not query-filtered) shown while the query is empty —
 * replaces the old "Accounts" list, which only ever surfaced creators whose
 * name happened to match the current text query rather than a real
 * top-creators browse.
 *
 * Tapping a film/short result doesn't link to /?v=<id> or /shorts —
 * Home/Shorts are curated lists now, not "every video," so a searched item
 * is very likely not in either. Instead this renders SwipeFeed/ShortsFeed
 * directly over the *search results themselves*, scoped to just the films
 * or shorts subset so the tapped id is guaranteed to resolve.
 */
export default function SearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("v");

  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [retryCount, setRetryCount] = useState(0);
  const [videos, setVideos] = useState<Video[]>([]);
  const [query, setQuery] = useState("");
  const [topCreators, setTopCreators] = useState<Creator[]>([]);
  const [featuredCollections, setFeaturedCollections] = useState<Collection[]>([]);

  // No synchronous setStatus("loading") here — status already starts
  // "loading" on mount; a retry resets it from its own click handler
  // instead (a real event handler, not an effect body).
  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchPublicVideos(100), fetchShorts(50), fetchTopCreators(12), fetchFeaturedCollections(10)])
      .then(([films, shorts, creators, collections]) => {
        if (cancelled) return;
        setVideos([...films, ...shorts]);
        setTopCreators(creators);
        setFeaturedCollections(collections);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [retryCount]);

  const loading = status === "loading";

  const results = useMemo(() => videos.filter((v) => matchesVideoQuery(v, query)), [videos, query]);
  const films = useMemo(() => results.filter((v) => v.contentType !== "short"), [results]);
  const shorts = useMemo(() => results.filter((v) => v.contentType === "short"), [results]);
  const browsing = query.trim().length === 0;

  if (selectedId) {
    if (shorts.some((v) => v.id === selectedId)) {
      return <ShortsFeed shorts={shorts} initialId={selectedId} />;
    }
    return <SwipeFeed videos={films} showSearchButton={false} />;
  }

  return (
    <div className="pb-24 md:pb-8">
      <div className="flex items-center gap-2 px-6 pt-8 pb-4">
        <button
          onClick={() => router.back()}
          aria-label="Back"
          className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-card transition-colors shrink-0"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 flex items-center gap-2 bg-card border border-border rounded-full px-4 py-2.5 focus-within:border-primary transition-colors">
          <SearchIcon size={16} className="text-text-secondary shrink-0" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search Frames, creators, tags"
            aria-label="Search"
            className="flex-1 bg-transparent text-sm outline-none"
          />
        </div>
      </div>

      {browsing && !loading && (
        <div className="flex flex-col gap-6 mb-6">
          <CreatorRow creators={topCreators} />
          <FeaturedCollections collections={featuredCollections} />
        </div>
      )}

      {status === "loading" ? (
        <SearchResultsSkeleton />
      ) : status === "error" ? (
        <div className="flex flex-col items-center justify-center py-16">
          <ErrorState
            onRetry={() => {
              setStatus("loading");
              setRetryCount((n) => n + 1);
            }}
            heading="Couldn't load search"
          />
        </div>
      ) : results.length === 0 ? (
        <p className="text-center text-text-secondary text-sm py-16 px-6">
          {query ? `Nothing matches "${query}".` : "Nothing to search yet."}
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 px-6">
            {results.map((video) => (
              <Link
                key={video.id}
                href={`/search?v=${video.id}`}
                aria-label={`Watch ${video.title} by @${video.creator.username}`}
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
                  <p className="text-[11px] text-text-secondary truncate">
                    @{video.creator.username}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
