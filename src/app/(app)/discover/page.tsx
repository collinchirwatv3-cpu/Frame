"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SwipeFeed, EmptyState } from "@/components/feed/SwipeFeed";
import { Shelf, type ShelfKind } from "@/components/feed/Shelf";
import { CollectionsShelf } from "@/components/feed/CollectionsShelf";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
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

/** Mirrors Shelf.tsx's own layout (a heading + a horizontal row of h-28/h-32
 * cards) so the transition from loading to real content doesn't reflow the
 * page — same reasoning as every other skeleton in this pass. */
function DiscoverSkeleton() {
  return (
    <div className="pt-8 pb-24">
      <div className="px-6 mb-2 flex flex-col gap-2">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-4 w-40" />
      </div>
      {[0, 1, 2].map((row) => (
        <section key={row} className="py-3">
          <div className="px-6 mb-2.5">
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="flex gap-3 overflow-x-hidden px-6 pb-1">
            {[0, 1, 2, 3].map((card) => (
              <Skeleton key={card} className="flex-shrink-0 h-28 md:h-32 w-44 md:w-52" />
            ))}
          </div>
        </section>
      ))}
    </div>
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
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [retryCount, setRetryCount] = useState(0);

  // No synchronous setStatus("loading") here on purpose (React Compiler
  // flags setState called directly in an effect body) — status already
  // starts "loading" on mount, and a retry explicitly resets it from its
  // own click handler below, which is a real event handler, not an effect.
  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    fetchShelves(userId)
      .then((result) => {
        if (cancelled) return;
        setShelves(result);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [hydrated, userId, retryCount]);

  if (selectedVideoId) {
    return <SwipeFeed videos={shelves[activeShelf]} showSearchButton={false} />;
  }

  if (status === "loading") {
    return <DiscoverSkeleton />;
  }

  if (status === "error") {
    return (
      <div className="h-dvh w-full flex flex-col items-center justify-center px-6">
        <ErrorState
          onRetry={() => {
            setStatus("loading");
            setRetryCount((n) => n + 1);
          }}
          heading="Couldn't load Discover"
        />
      </div>
    );
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
        <p className="text-text-secondary text-sm">Tap a Frame to watch.</p>
      </div>

      <Shelf kind="forYou" title="For You" videos={shelves.forYou} />
      {userId && (
        <>
          <Shelf
            kind="following"
            title="Following"
            videos={shelves.following}
            emptyMessage="Follow creators to see their Frames here."
          />
          <Shelf
            kind="saved"
            title="Saved"
            videos={shelves.saved}
            emptyMessage="Save a Frame from the feed and it'll show up here."
          />
          <Shelf
            kind="history"
            title="History"
            videos={shelves.history}
            emptyMessage="Frames you watch will show up here."
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
