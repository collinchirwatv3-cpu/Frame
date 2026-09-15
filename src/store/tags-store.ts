import { create } from "zustand";
import { fetchVideoTags } from "@/lib/tags-fetch";
import type { Tag } from "@/lib/types";

type VideoTagTiers = { primary: Tag[]; secondary: Tag[]; technical: Tag[] };

const EMPTY_TIERS: VideoTagTiers = { primary: [], secondary: [], technical: [] };

type TagsState = {
  byVideoId: Record<string, VideoTagTiers>;
  loadingVideoId: string | null;
  /** No-op if already fetched or a fetch for this video is in flight — same
   * "fetch once, cache by video id" shape as clips-store.ts. Shared by
   * VideoOverlay (primary chip) and VideoDetailsSheet (secondary/technical
   * tiers) so both read from one cached fetch, not two. */
  fetchVideoTagTiers: (videoId: string) => Promise<void>;
};

export const useTagsStore = create<TagsState>()((set, get) => ({
  byVideoId: {},
  loadingVideoId: null,

  fetchVideoTagTiers: async (videoId) => {
    if (get().byVideoId[videoId] || get().loadingVideoId === videoId) return;
    set({ loadingVideoId: videoId });

    const tiers = await fetchVideoTags(videoId);

    set((s) => ({
      loadingVideoId: s.loadingVideoId === videoId ? null : s.loadingVideoId,
      byVideoId: { ...s.byVideoId, [videoId]: tiers },
    }));
  },
}));

export function selectVideoTagTiers(videoId: string) {
  return (s: TagsState) => s.byVideoId[videoId] ?? EMPTY_TIERS;
}
