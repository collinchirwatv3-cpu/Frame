import { fetchPublicVideos, fetchSavedVideos, fetchHistoryVideos } from "@/lib/video-fetch";
import type { Video } from "@/lib/types";

const TOTAL_CAP = 50;
const FOR_YOU_CAP = 30;

/**
 * Home's feed: For You, then Saved, then History, one continuous sequence,
 * capped at 50 total. A video already shown earlier in the sequence (e.g.
 * something recent that's also saved) isn't repeated later in it — first
 * occurrence wins, section order is the priority order.
 *
 * Signed-out visitors (userId null) get For You only — Saved/History are
 * inherently per-account.
 *
 * All three sections are fetched in parallel, not sequentially — none of
 * them actually need each other's *data*, only a budget computed from each
 * other's result *counts*, so there's no reason to pay three round trips
 * back to back on every Home load. Saved/History are asked for up to the
 * full remaining cap rather than a precisely pre-computed remainder; worst
 * case that over-fetches a few rows that get sliced away below, which is
 * far cheaper than a third sequential network round trip.
 */
export async function fetchHomeFeed(userId: string | null): Promise<Video[]> {
  if (!userId) {
    const forYou = await fetchPublicVideos(FOR_YOU_CAP);
    return forYou.slice(0, TOTAL_CAP);
  }

  const [forYou, saved, history] = await Promise.all([
    fetchPublicVideos(FOR_YOU_CAP),
    fetchSavedVideos(userId, TOTAL_CAP),
    fetchHistoryVideos(userId, TOTAL_CAP),
  ]);

  const seen = new Set<string>();
  const combined: Video[] = [];
  for (const video of [...forYou, ...saved, ...history]) {
    if (seen.has(video.id)) continue;
    seen.add(video.id);
    combined.push(video);
    if (combined.length === TOTAL_CAP) break;
  }

  return combined;
}
