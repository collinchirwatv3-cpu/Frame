import { create } from "zustand";
import { createClient } from "@/lib/supabase/client";
import { formatRelativeTime } from "@/lib/utils";
import { useEngagementStore } from "./engagement-store";

export type Comment = {
  id: string;
  author: string;
  avatarUrl: string;
  text: string;
  timestamp: string;
  /** Null for a top-level comment, set to that comment's id for a reply —
   * single level deep only (a reply's own parentId always points at a
   * top-level comment, never at another reply). */
  parentId: string | null;
};

type CommentRow = {
  id: string;
  text: string;
  created_at: string;
  parent_id: string | null;
  user: { username: string; avatar_url: string | null } | null;
};

function toComment(row: CommentRow): Comment {
  return {
    id: row.id,
    author: row.user?.username ?? "unknown",
    avatarUrl: row.user?.avatar_url ?? "",
    text: row.text,
    timestamp: formatRelativeTime(row.created_at),
    parentId: row.parent_id,
  };
}

type CommentsState = {
  byVideoId: Record<string, Comment[]>;
  loadingVideoId: string | null;
  /** No-op if already fetched or a fetch for this video is in flight. */
  fetchComments: (videoId: string) => Promise<void>;
  addComment: (videoId: string, text: string, parentId?: string) => Promise<void>;
};

export const useCommentsStore = create<CommentsState>()((set, get) => ({
  byVideoId: {},
  loadingVideoId: null,

  fetchComments: async (videoId) => {
    if (get().byVideoId[videoId] || get().loadingVideoId === videoId) return;
    set({ loadingVideoId: videoId });

    const supabase = createClient();
    const { data, error } = await supabase
      .from("comments")
      .select("id, text, created_at, parent_id, user:profiles(username, avatar_url)")
      .eq("video_id", videoId)
      .order("created_at", { ascending: true });

    set((s) => ({
      loadingVideoId: s.loadingVideoId === videoId ? null : s.loadingVideoId,
      byVideoId:
        error || !data ? s.byVideoId : { ...s.byVideoId, [videoId]: (data as unknown as CommentRow[]).map(toComment) },
    }));
  },

  addComment: async (videoId, text, parentId) => {
    const userId = useEngagementStore.getState().userId;
    if (!userId) {
      window.location.assign("/login");
      return;
    }

    const supabase = createClient();
    const { data, error } = await supabase
      .from("comments")
      .insert({ video_id: videoId, user_id: userId, text, parent_id: parentId ?? null })
      .select("id, text, created_at, parent_id, user:profiles(username, avatar_url)")
      .single();

    if (error || !data) return;
    set((s) => ({
      byVideoId: {
        ...s.byVideoId,
        [videoId]: [...(s.byVideoId[videoId] ?? []), toComment(data as unknown as CommentRow)],
      },
    }));
  },
}));
