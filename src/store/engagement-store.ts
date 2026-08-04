import { create } from "zustand";
import { createClient } from "@/lib/supabase/client";

type EngagementState = {
  userId: string | null;
  hydrated: boolean;
  likedVideos: Record<string, boolean>;
  savedVideos: Record<string, boolean>;
  followedCreators: Record<string, boolean>;
  savedCollections: Record<string, boolean>;
  /** Called by AuthListener on sign-in/sign-out — (re)hydrates from the real
   * likes/saves/follows/saved_collections tables scoped to the given user. */
  setUser: (userId: string | null) => Promise<void>;
  toggleLike: (videoId: string) => Promise<void>;
  toggleSave: (videoId: string) => Promise<void>;
  toggleFollow: (creatorId: string) => Promise<void>;
  toggleSavedCollection: (collectionId: string) => Promise<void>;
};

const EMPTY: Record<string, boolean> = {};

function toDict(rows: { [key: string]: string }[] | null | undefined, key: string) {
  const dict: Record<string, boolean> = {};
  for (const row of rows ?? []) dict[row[key]] = true;
  return dict;
}

/** Optimistically flips `key` in `dict`, writes the flip to `table`, and
 * rolls the optimistic flip back if the write fails. Every toggle action
 * below is a thin, table-specific wrapper around this. */
async function toggle({
  key,
  dictKey,
  get,
  set,
  table,
  match,
  insertRow,
}: {
  key: string;
  dictKey: "likedVideos" | "savedVideos" | "followedCreators" | "savedCollections";
  get: () => EngagementState;
  set: (partial: Partial<EngagementState>) => void;
  table: string;
  match: Record<string, string>;
  insertRow: Record<string, string>;
}) {
  const userId = get().userId;
  if (!userId) {
    window.location.assign("/login");
    return;
  }
  const dict = get()[dictKey];
  const next = !dict[key];
  set({ [dictKey]: { ...dict, [key]: next } } as Partial<EngagementState>);

  const supabase = createClient();
  const { error } = next
    ? await supabase.from(table).insert(insertRow)
    : await supabase.from(table).delete().match(match);

  if (error) {
    const current = get()[dictKey];
    set({ [dictKey]: { ...current, [key]: !next } } as Partial<EngagementState>);
  }
}

export const useEngagementStore = create<EngagementState>()((set, get) => ({
  userId: null,
  hydrated: false,
  likedVideos: EMPTY,
  savedVideos: EMPTY,
  followedCreators: EMPTY,
  savedCollections: EMPTY,

  setUser: async (userId) => {
    if (!userId) {
      set({
        userId: null,
        hydrated: true,
        likedVideos: EMPTY,
        savedVideos: EMPTY,
        followedCreators: EMPTY,
        savedCollections: EMPTY,
      });
      return;
    }

    const supabase = createClient();
    const [likes, saves, follows, savedCollections] = await Promise.all([
      supabase.from("likes").select("video_id").eq("user_id", userId),
      supabase.from("saves").select("video_id").eq("user_id", userId),
      supabase.from("follows").select("followee_id").eq("follower_id", userId),
      supabase.from("saved_collections").select("collection_id").eq("user_id", userId),
    ]);

    set({
      userId,
      hydrated: true,
      likedVideos: toDict(likes.data, "video_id"),
      savedVideos: toDict(saves.data, "video_id"),
      followedCreators: toDict(follows.data, "followee_id"),
      savedCollections: toDict(savedCollections.data, "collection_id"),
    });
  },

  toggleLike: (videoId) =>
    toggle({
      key: videoId,
      dictKey: "likedVideos",
      get,
      set,
      table: "likes",
      match: { user_id: get().userId!, video_id: videoId },
      insertRow: { user_id: get().userId!, video_id: videoId },
    }),

  toggleSave: (videoId) =>
    toggle({
      key: videoId,
      dictKey: "savedVideos",
      get,
      set,
      table: "saves",
      match: { user_id: get().userId!, video_id: videoId },
      insertRow: { user_id: get().userId!, video_id: videoId },
    }),

  toggleFollow: (creatorId) =>
    toggle({
      key: creatorId,
      dictKey: "followedCreators",
      get,
      set,
      table: "follows",
      match: { follower_id: get().userId!, followee_id: creatorId },
      insertRow: { follower_id: get().userId!, followee_id: creatorId },
    }),

  toggleSavedCollection: (collectionId) =>
    toggle({
      key: collectionId,
      dictKey: "savedCollections",
      get,
      set,
      table: "saved_collections",
      match: { user_id: get().userId!, collection_id: collectionId },
      insertRow: { user_id: get().userId!, collection_id: collectionId },
    }),
}));
