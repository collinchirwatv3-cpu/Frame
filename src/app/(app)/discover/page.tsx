"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SwipeFeed, EmptyState } from "@/components/feed/SwipeFeed";
import { Shelf, type ShelfKind } from "@/components/feed/Shelf";
import { CollectionsShelf } from "@/components/feed/CollectionsShelf";
import {
  fetchPublicVideos,
  fetchFollowingVideos,
  fetchSavedVideos,
  fetchHistoryVideos,
  fetchDiscoverVideos,
} from "@/lib/video-fetch";
import { collections } from "@/lib/mock-data";
import { useEngagementStore } from "@/store/engagement-store";
import type { Video } from "@/lib/types";

const SHELF_CAP = 20;

type Shelves = { forYou: Video[]; following: Video[]; saved: Video[]; history: Video[]; discover: Video[] };
const EMPTY_SHELVES: Shelves = { forYou: [], following: [], saved: [], history: [], discover: [] };

async function fetchShelves(userId: string | null): Promise<Shelves> {
  if (!userId) {
    const [forYou, discover] = await Promise.all([
      fetchPublicVideos(SHELF_CAP),
      fetchDiscoverVideos(null, SHELF_CAP),
    ]);
    return { ...EMPTY_SHELVES, forYou, discover };
  }
  const [forYou, following, saved, history, discover] = await Promise.all([
    fetchPublicVideos(SHELF_CAP),
    fetchFollowingVideos(userId, SHELF_CAP),
    fetchSavedVideos(userId, SHELF_CAP),
    fetchHistoryVideos(userId, SHELF_CAP),
    fetchDiscoverVideos(userId, SHELF_CAP),
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
 * Discover: Home's old shelf feed (For You / Following / Saved / History /
 * Collections) merged with Discover's own former identity — a full-screen
 * swipe feed of unwatched public films — which is now the "Discover" shelf
 * at the end rather than a separate page/mode. Formerly two deliberately
 * different browsing surfaces (see git history — FeedRoot.tsx used to own
 * this exact body at `/`, plain Discover was a bare <SwipeFeed>); merged
 * into one page as part of moving to a 5-tab nav (Shorts/Discover/Search/
 * Parties/Profile) that no longer has a separate Home destination. `/`
 * redirects here now (see (app)/page.tsx).
 *
 * Tapping a card opens the same immersive SwipeFeed player as always
 * (?v=<id>), scoped to whichever shelf the card came from (&shelf=<kind> —
 * see Shelf.tsx), since each shelf is its own separate fetch, not one
 * merged array.
 */
export default function DiscoverPage() {
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
    return <SwipeFeed videos={shelves[activeShelf]} showSearchButton={false} />;
  }

  if (shelves.forYou.length === 0) {
    return (
      <div className="h-dvh w-full flex flex-col items-center justify-center gap-3 text-center px-6">
        <EmptyState />
      </div>
    );
  }

  return (
    <div className="pt-8 pb-24">
      <div className="px-6 mb-2">
        <h1 className="font-serif text-2xl font-semibold mb-1">Discover</h1>
        <p className="text-text-secondary text-sm">Tap a film to watch.</p>
      </div>

      <Shelf kind="forYou" title="For You" videos={shelves.forYou} />
      {userId && (
        <>
          <Shelf
            kind="following"
            title="Following"
            videos={shelves.following}
            emptyMessage="Follow creators to see their films here."
          />
          <Shelf
            kind="saved"
            title="Saved"
            videos={shelves.saved}
            emptyMessage="Save a film from the feed and it'll show up here."
          />
          <Shelf
            kind="history"
            title="History"
            videos={shelves.history}
            emptyMessage="Films you watch will show up here."
          />
        </>
      )}
      <Shelf
        kind="discover"
        title="Discover"
        videos={shelves.discover}
        emptyMessage="Nothing new to discover right now."
      />
      <CollectionsShelf collections={collections} />
    </div>
  );
}
