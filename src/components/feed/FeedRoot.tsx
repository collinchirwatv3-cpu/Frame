"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SwipeFeed, EmptyState } from "./SwipeFeed";
import { Shelf, type ShelfKind } from "./Shelf";
import { CollectionsRail } from "@/components/collections/CollectionsRail";
import {
  fetchPublicVideos,
  fetchFollowingVideos,
  fetchSavedVideos,
  fetchHistoryVideos,
} from "@/lib/video-fetch";
import { collections } from "@/lib/mock-data";
import { useEngagementStore } from "@/store/engagement-store";
import type { Video } from "@/lib/types";

const SHELF_CAP = 20;

type Shelves = { forYou: Video[]; following: Video[]; saved: Video[]; history: Video[] };
const EMPTY_SHELVES: Shelves = { forYou: [], following: [], saved: [], history: [] };

async function fetchShelves(userId: string | null): Promise<Shelves> {
  if (!userId) {
    return { ...EMPTY_SHELVES, forYou: await fetchPublicVideos(SHELF_CAP) };
  }
  const [forYou, following, saved, history] = await Promise.all([
    fetchPublicVideos(SHELF_CAP),
    fetchFollowingVideos(userId, SHELF_CAP),
    fetchSavedVideos(userId, SHELF_CAP),
    fetchHistoryVideos(userId, SHELF_CAP),
  ]);
  return { forYou, following, saved, history };
}

function isShelfKind(value: string | null): value is ShelfKind {
  return value === "forYou" || value === "following" || value === "saved" || value === "history";
}

/**
 * Home: a scrollable page of horizontal shelves — For You, Collections,
 * then (signed in) Following / Saved / History — Netflix/YouTube-shelf
 * style, replacing the earlier tabs + full-screen-swipe-feed default (that
 * whole approach, including the portrait-vs-landscape tile-grid/SwipeFeed
 * branching and the category chip strip, is gone; see git history if any of
 * it needs resurrecting). One layout regardless of device now — phones,
 * tablets, and desktop all land here.
 *
 * Collections reuses CollectionsRail as-is (same component already shown on
 * Profile's Saved Collections) — still backed by mock-data.ts, same as
 * everywhere else it appears; making it real is a separate, not-yet-done
 * project, not something this change touches.
 *
 * Tapping a card still opens the same immersive SwipeFeed player as always
 * (?v=<id>), just scoped to whichever shelf the card came from
 * (&shelf=<kind> — see Shelf.tsx) rather than always For You, since each
 * shelf is its own separate fetch now, not one merged array.
 *
 * Following/Saved/History are inherently per-account — signed-out visitors
 * only ever get the For You shelf. If For You itself comes back empty, the
 * whole catalog is necessarily empty too (Following only ever shows a
 * subset of the same public videos; Saved/History reference videos that
 * would have to already exist) — so that case collapses to one page-level
 * empty state rather than four individually-empty shelves.
 */
export function FeedRoot() {
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
    return <SwipeFeed videos={shelves[activeShelf]} />;
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
      <h1 className="text-2xl font-bold px-6 mb-1">FRAMES</h1>
      <p className="text-text-secondary text-sm px-6 mb-2">Tap a film to watch.</p>

      <Shelf kind="forYou" title="For You" videos={shelves.forYou} />
      <div className="py-3">
        <CollectionsRail collections={collections} title="Collections" />
      </div>
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
    </div>
  );
}
