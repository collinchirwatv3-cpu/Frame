"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ShortsFeed } from "@/components/shorts/ShortsFeed";
import { Shelf, type ShelfKind } from "@/components/feed/Shelf";
import { EmptyState } from "@/components/ui/EmptyState";
import { Clapperboard } from "lucide-react";
import {
  fetchShorts,
  fetchFollowingVideos,
  fetchSavedVideos,
  fetchHistoryVideos,
  fetchDiscoverVideos,
} from "@/lib/video-fetch";
import { useEngagementStore } from "@/store/engagement-store";
import type { Video } from "@/lib/types";

const SHELF_CAP = 20;

type Shelves = { forYou: Video[]; following: Video[]; saved: Video[]; history: Video[]; discover: Video[] };
const EMPTY_SHELVES: Shelves = { forYou: [], following: [], saved: [], history: [], discover: [] };

async function fetchShelves(userId: string | null): Promise<Shelves> {
  if (!userId) {
    const [forYou, discover] = await Promise.all([
      fetchShorts(SHELF_CAP),
      fetchDiscoverVideos(null, SHELF_CAP, "short"),
    ]);
    return { ...EMPTY_SHELVES, forYou, discover };
  }
  const [forYou, following, saved, history, discover] = await Promise.all([
    fetchShorts(SHELF_CAP),
    fetchFollowingVideos(userId, SHELF_CAP, "short"),
    fetchSavedVideos(userId, SHELF_CAP, "short"),
    fetchHistoryVideos(userId, SHELF_CAP, "short"),
    fetchDiscoverVideos(userId, SHELF_CAP, "short"),
  ]);
  return { forYou, following, saved, history, discover };
}

function isShelfKind(value: string | null): value is ShelfKind {
  return (
    value === "forYou" ||
    value === "following" ||
    value === "saved" ||
    value === "history" ||
    value === "discover"
  );
}

/**
 * Shorts, restructured to match Discover's own shape: a browsable landing
 * page of shelves (For You / Following / Saved / History / Discover, same
 * five kinds, same Shelf component) rather than dropping straight into the
 * full-screen swipe player. Tapping a card opens ShortsFeed (not SwipeFeed
 * — shorts still play in the vertical swipe player, just reached the same
 * "browse, then tap to watch" way Discover's films are) scoped to whichever
 * shelf the card came from, mirroring discover/page.tsx exactly.
 *
 * Each shelf here is its own fetch filtered to content_type: "short" (see
 * video-fetch.ts) — a separate set of shelves from Discover's own, not the
 * same five arrays reused, since a following/saved/history film and a
 * following/saved/history short are different underlying queries.
 */
export default function ShortsPage() {
  const searchParams = useSearchParams();
  const selectedVideoId = searchParams.get("v");
  const shelfParam = searchParams.get("shelf");
  const activeShelf: ShelfKind = isShelfKind(shelfParam) ? shelfParam : "forYou";

  const userId = useEngagementStore((s) => s.userId);
  const hydrated = useEngagementStore((s) => s.hydrated);
  const [shelves, setShelves] = useState<Shelves>(EMPTY_SHELVES);

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    fetchShelves(userId).then((result) => {
      if (!cancelled) setShelves(result);
    });
    return () => {
      cancelled = true;
    };
  }, [hydrated, userId]);

  if (selectedVideoId) {
    return <ShortsFeed shorts={shelves[activeShelf]} initialId={selectedVideoId} />;
  }

  if (shelves.forYou.length === 0) {
    return (
      <div className="h-dvh w-full flex flex-col items-center justify-center gap-3 text-center px-6">
        <EmptyState icon={Clapperboard} heading="No shorts yet" subtext="Be the first to post one." />
      </div>
    );
  }

  return (
    <div className="pt-8 pb-24">
      <div className="px-6 mb-2">
        <h1 className="font-serif text-2xl font-semibold mb-1">Shorts</h1>
        <p className="text-text-secondary text-sm">Tap a short to watch.</p>
      </div>

      <Shelf kind="forYou" title="For You" videos={shelves.forYou} basePath="/shorts" />
      {userId && (
        <>
          <Shelf
            kind="following"
            title="Following"
            videos={shelves.following}
            emptyMessage="Follow creators to see their shorts here."
            basePath="/shorts"
          />
          <Shelf
            kind="saved"
            title="Saved"
            videos={shelves.saved}
            emptyMessage="Save a short from the feed and it'll show up here."
            basePath="/shorts"
          />
          <Shelf
            kind="history"
            title="History"
            videos={shelves.history}
            emptyMessage="Shorts you watch will show up here."
            basePath="/shorts"
          />
        </>
      )}
      <Shelf
        kind="discover"
        title="Discover"
        videos={shelves.discover}
        emptyMessage="Nothing new to discover right now."
        basePath="/shorts"
      />
    </div>
  );
}
