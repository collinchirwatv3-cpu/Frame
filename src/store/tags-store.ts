import { create } from "zustand";
import { fetchVideoTags, type VideoTagTiers } from "@/lib/tags-fetch";

const EMPTY_TIERS: VideoTagTiers = { primary: [], secondary: [], technical: [] };

type TagsState = {
  byVideoId: Record<string, VideoTagTiers>;
  /** Per-video, not one global slot — a global `loadingVideoId: string |
   * null` meant only one video could ever appear "loading" at once, and a
   * second video's fetch would silently stop the first one's in-flight
   * guard from working (this exact bug: concurrent fetches for different
   * videos, or a duplicate call for the same video, weren't actually
   * prevented). */
  loadingVideoIds: Record<string, boolean>;
  /** Set on a genuine fetch failure (network/RLS/error), separate from
   * byVideoId simply having no entry yet (still loading) or having an
   * entry with empty arrays (a video that legitimately has no tags). */
  errorVideoIds: Record<string, boolean>;
  /** Bumped by reset() so an in-flight fetch started before a reset can
   * tell its own result is stale and discard it instead of repopulating a
   * cache that was just intentionally cleared. */
  epoch: number;
  /** No-op if a fetch for this video is already in flight, or already
   * cached with no error — same "fetch once, cache by video id" shape as
   * clips-store.ts, but per-video and retry-capable on failure. Previously
   * loaded tags for this video (if any) stay visible in byVideoId across a
   * failed refetch — only errorVideoIds flips, nothing is cleared. */
  fetchVideoTagTiers: (videoId: string) => Promise<void>;
  /** Clears the cache and bumps epoch — call on auth identity change
   * (AuthListener) so tags fetched under one session (whose RLS-visible
   * set may differ) can't leak into another via a stale cache hit, and so
   * any fetch still in flight from the previous identity is discarded
   * when it resolves rather than repopulating the cleared cache. */
  reset: () => void;
};

export const useTagsStore = create<TagsState>()((set, get) => ({
  byVideoId: {},
  loadingVideoIds: {},
  errorVideoIds: {},
  epoch: 0,

  fetchVideoTagTiers: async (videoId) => {
    const s = get();
    if (s.loadingVideoIds[videoId]) return;
    if (s.byVideoId[videoId] && !s.errorVideoIds[videoId]) return;

    const startEpoch = s.epoch;
    set((s) => ({ loadingVideoIds: { ...s.loadingVideoIds, [videoId]: true } }));

    const result = await fetchVideoTags(videoId);

    set((s) => {
      if (s.epoch !== startEpoch) return {}; // stale — cache was reset mid-fetch
      const loadingVideoIds = { ...s.loadingVideoIds };
      delete loadingVideoIds[videoId];

      if (!result.ok) {
        return { loadingVideoIds, errorVideoIds: { ...s.errorVideoIds, [videoId]: true } };
      }
      const errorVideoIds = { ...s.errorVideoIds };
      delete errorVideoIds[videoId];
      return { loadingVideoIds, errorVideoIds, byVideoId: { ...s.byVideoId, [videoId]: result.tiers } };
    });
  },

  reset: () => set((s) => ({ byVideoId: {}, loadingVideoIds: {}, errorVideoIds: {}, epoch: s.epoch + 1 })),
}));

export function selectVideoTagTiers(videoId: string) {
  return (s: TagsState) => s.byVideoId[videoId] ?? EMPTY_TIERS;
}
export function selectVideoTagsLoading(videoId: string) {
  return (s: TagsState) => !!s.loadingVideoIds[videoId];
}
export function selectVideoTagsError(videoId: string) {
  return (s: TagsState) => !!s.errorVideoIds[videoId];
}
