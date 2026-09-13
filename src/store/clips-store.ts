import { create } from "zustand";
import { createClient } from "@/lib/supabase/client";
import { useEngagementStore } from "./engagement-store";
import type { Clip } from "@/lib/types";

type ClipRow = {
  id: string;
  video_id: string;
  user_id: string;
  start_seconds: number;
  end_seconds: number;
  title: string | null;
  created_at: string;
  creator: { display_name: string } | null;
};

function toClip(row: ClipRow): Clip {
  return {
    id: row.id,
    videoId: row.video_id,
    userId: row.user_id,
    creatorDisplayName: row.creator?.display_name ?? "Someone",
    startSeconds: row.start_seconds,
    endSeconds: row.end_seconds,
    title: row.title ?? undefined,
    createdAt: row.created_at,
  };
}

type ClipsState = {
  byVideoId: Record<string, Clip[]>;
  loadingVideoId: string | null;
  /** No-op if already fetched or a fetch for this video is in flight —
   * same "fetch once, cache by video id" shape as comments-store.ts. */
  fetchClips: (videoId: string) => Promise<void>;
  createClip: (params: { videoId: string; startSeconds: number; endSeconds: number; title?: string }) => Promise<boolean>;
};

export const useClipsStore = create<ClipsState>()((set, get) => ({
  byVideoId: {},
  loadingVideoId: null,

  fetchClips: async (videoId) => {
    if (get().byVideoId[videoId] || get().loadingVideoId === videoId) return;
    set({ loadingVideoId: videoId });

    const supabase = createClient();
    const { data, error } = await supabase
      .from("clips")
      .select("id, video_id, user_id, start_seconds, end_seconds, title, created_at, creator:profiles(display_name)")
      .eq("video_id", videoId)
      .order("created_at", { ascending: false });

    set((s) => ({
      loadingVideoId: s.loadingVideoId === videoId ? null : s.loadingVideoId,
      byVideoId:
        error || !data ? s.byVideoId : { ...s.byVideoId, [videoId]: (data as unknown as ClipRow[]).map(toClip) },
    }));
  },

  createClip: async ({ videoId, startSeconds, endSeconds, title }) => {
    const userId = useEngagementStore.getState().userId;
    if (!userId) {
      window.location.assign("/login");
      return false;
    }

    const supabase = createClient();
    const { data, error } = await supabase
      .from("clips")
      .insert({ video_id: videoId, user_id: userId, start_seconds: startSeconds, end_seconds: endSeconds, title })
      .select("id, video_id, user_id, start_seconds, end_seconds, title, created_at, creator:profiles(display_name)")
      .single();

    if (error || !data) return false;
    set((s) => ({
      byVideoId: {
        ...s.byVideoId,
        [videoId]: [toClip(data as unknown as ClipRow), ...(s.byVideoId[videoId] ?? [])],
      },
    }));
    return true;
  },
}));
