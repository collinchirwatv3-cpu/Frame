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
 */
export async function fetchHomeFeed(userId: string | null): Promise<Video[]> {
  const forYou = await fetchPublicVideos(FOR_YOU_CAP);

  if (!userId) return forYou.slice(0, TOTAL_CAP);

  const seen = new Set(forYou.map((v) => v.id));
  const remainingAfterForYou = TOTAL_CAP - forYou.length;

  const saved = remainingAfterForYou > 0 ? await fetchSavedVideos(userId, remainingAfterForYou) : [];
  const newSaved = saved.filter((v) => !seen.has(v.id));
  newSaved.forEach((v) => seen.add(v.id));

  const remainingAfterSaved = remainingAfterForYou - newSaved.length;
  const history = remainingAfterSaved > 0 ? await fetchHistoryVideos(userId, remainingAfterSaved) : [];
  const newHistory = history.filter((v) => !seen.has(v.id));

  return [...forYou, ...newSaved, ...newHistory].slice(0, TOTAL_CAP);
}
