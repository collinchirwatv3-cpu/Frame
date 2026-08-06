"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { CategoryChips } from "@/components/explore/CategoryChips";
import { AspectRatioChips } from "@/components/explore/AspectRatioChips";
import { TrendingGrid } from "@/components/explore/TrendingGrid";
import { VideoRail } from "@/components/explore/VideoRail";
import { CollectionsRail } from "@/components/collections/CollectionsRail";
import { videos, collections } from "@/lib/mock-data";
import { computeBadges } from "@/lib/badges";
import { useEngagementStore } from "@/store/engagement-store";
import { classifyAspectRatio, type AspectRatioId } from "@/lib/aspect-ratio";
import { matchesVideoQuery, matchesCollectionQuery } from "@/lib/search";
import { cn } from "@/lib/utils";
import type { Category } from "@/lib/types";

export default function ExplorePage() {
  const [mode, setMode] = useState<"discover" | "browse">("discover");
  const [category, setCategory] = useState<Category | "All">("All");
  const [ratio, setRatio] = useState<AspectRatioId | "All">("All");
  const [query, setQuery] = useState("");
  const savedVideos = useEngagementStore((s) => s.savedVideos);

  const filtered = useMemo(() => {
    return videos.filter((v) => {
      const matchesCategory = category === "All" || v.category === category;
      const matchesRatio = ratio === "All" || classifyAspectRatio(v.width, v.height)?.id === ratio;
      return matchesCategory && matchesRatio && matchesVideoQuery(v, query);
    });
  }, [category, ratio, query]);

  const matchingCollections = useMemo(() => {
    if (!query.trim()) return [];
    return collections.filter((c) => matchesCollectionQuery(c, query));
  }, [query]);

  // Editorial rails derived from signals we already have — badges and follower
  // counts — rather than a separate hand-curated dataset. Deliberately not the
  // brief's full example list: with 4 creators and 5 videos, rails like "Award
  // Winners" or "Trending Collections" would have no real signal behind them
  // and would just be re-labeled slices of the same handful of videos — the
  // "endless algorithmic clutter" the brief itself warns against.
  const watchLater = videos.filter((v) => savedVideos[v.id]);
  const staffPicks = videos.filter((v) => computeBadges(v).includes("FRAMES Certified"));
  const bestDrone = videos.filter((v) => computeBadges(v).includes("Drone"));
  const newVoices = videos.filter((v) => v.creator.followers < 150_000);

  return (
    <div className="pt-8 pb-24 md:pb-8 flex flex-col gap-8">
      <div className="px-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Explore</h1>
        <div className="flex bg-card border border-border rounded-full p-0.5 text-xs font-medium shrink-0">
          <button
            onClick={() => setMode("discover")}
            className={cn(
              "px-3 py-1.5 rounded-full transition-colors",
              mode === "discover" ? "bg-primary text-bg" : "text-text-secondary"
            )}
          >
            Discover
          </button>
          <button
            onClick={() => setMode("browse")}
            className={cn(
              "px-3 py-1.5 rounded-full transition-colors",
              mode === "browse" ? "bg-primary text-bg" : "text-text-secondary"
            )}
          >
            Browse all
          </button>
        </div>
      </div>

      {mode === "discover" ? (
        <>
          <VideoRail title="Watch Later" videos={watchLater} size="large" />
          <VideoRail title="Staff Picks" videos={staffPicks} />
          <CollectionsRail collections={collections} />
          <VideoRail title="Best Drone Footage" videos={bestDrone} />
          <VideoRail title="New Voices" videos={newVoices} />
        </>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="px-6">
            <div className="flex items-center gap-2 bg-card border border-border rounded-full px-4 py-2.5 focus-within:border-primary transition-colors">
              <Search size={16} className="text-text-secondary" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search creators, titles…"
                aria-label="Search creators, titles"
                className="bg-transparent outline-none text-sm w-full placeholder:text-text-secondary"
              />
            </div>
          </div>
          <CategoryChips active={category} onChange={setCategory} />
          <AspectRatioChips active={ratio} onChange={setRatio} />
          {matchingCollections.length > 0 && (
            <CollectionsRail collections={matchingCollections} title="Matching collections" />
          )}
          <div className="mt-2">
            <TrendingGrid videos={filtered} />
          </div>
        </div>
      )}
    </div>
  );
}
