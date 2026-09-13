import { create } from "zustand";
import { createClient } from "@/lib/supabase/client";

type EngagementKind = "like" | "save" | "follow" | "saved-collection";

type EngagementState = {
  userId: string | null;
  hydrated: boolean;
  likedVideos: Record<string, boolean>;
  savedVideos: Record<string, boolean>;
  followedCreators: Record<string, boolean>;
  savedCollections: Record<string, boolean>;
  blockedUsers: Record<string, boolean>;
  /** Called by AuthListener on sign-in/sign-out — (re)hydrates from the real
   * likes/saves/follows/saved_collections/blocks tables scoped to the given
   * user. */
  setUser: (userId: string | null) => Promise<void>;
  toggleLike: (videoId: string) => Promise<void>;
  toggleSave: (videoId: string) => Promise<void>;
  toggleFollow: (creatorId: string) => Promise<void>;
  toggleSavedCollection: (collectionId: string) => Promise<void>;
  /** Blocking goes through /api/block, not the generic toggle() helper —
   * it has a real server-side side effect (force-unfollow both directions)
   * that a thin insert/delete proxy can't express, so it isn't optimistic
   * like the others: the dict only flips once the server confirms. Returns
   * whether it succeeded, since callers (ProfileHeader) act on that (an
   * error stays silent otherwise, unlike a failed like/save). */
  toggleBlock: (targetId: string, block: boolean) => Promise<boolean>;
};

const EMPTY: Record<string, boolean> = {};

function toDict(rows: { [key: string]: string }[] | null | undefined, key: string) {
  const dict: Record<string, boolean> = {};
  for (const row of rows ?? []) dict[row[key]] = true;
  return dict;
}

/** Optimistically flips `key` in `dict`, posts the flip to
 * /api/engagement/[kind] (server-side auth + rate limit, same RLS-respecting
 * insert/delete this used to do straight from the client), and rolls the
 * optimistic flip back if that fails. Every toggle action below is a thin
 * wrapper around this. */
async function toggle({
  key,
  dictKey,
  get,
  set,
  kind,
}: {
  key: string;
  dictKey: "likedVideos" | "savedVideos" | "followedCreators" | "savedCollections";
  get: () => EngagementState;
  set: (partial: Partial<EngagementState>) => void;
  kind: EngagementKind;
}) {
  const userId = get().userId;
  if (!userId) {
    window.location.assign("/login");
    return;
  }
  const dict = get()[dictKey];
  const next = !dict[key];
  set({ [dictKey]: { ...dict, [key]: next } } as Partial<EngagementState>);

  const res = await fetch(`/api/engagement/${kind}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetId: key, active: next }),
  });

  if (!res.ok) {
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
  blockedUsers: EMPTY,

  setUser: async (userId) => {
    if (!userId) {
      set({
        userId: null,
        hydrated: true,
        likedVideos: EMPTY,
        savedVideos: EMPTY,
        followedCreators: EMPTY,
        savedCollections: EMPTY,
        blockedUsers: EMPTY,
      });
      return;
    }

    const supabase = createClient();
    const [likes, saves, follows, savedCollections, blocks] = await Promise.all([
      supabase.from("likes").select("video_id").eq("user_id", userId),
      supabase.from("saves").select("video_id").eq("user_id", userId),
      supabase.from("follows").select("followee_id").eq("follower_id", userId),
      supabase.from("saved_collections").select("collection_id").eq("user_id", userId),
      supabase.from("blocks").select("blocked_id").eq("blocker_id", userId),
    ]);

    set({
      userId,
      hydrated: true,
      likedVideos: toDict(likes.data, "video_id"),
      savedVideos: toDict(saves.data, "video_id"),
      followedCreators: toDict(follows.data, "followee_id"),
      savedCollections: toDict(savedCollections.data, "collection_id"),
      blockedUsers: toDict(blocks.data, "blocked_id"),
    });
  },

  toggleLike: (videoId) =>
    toggle({ key: videoId, dictKey: "likedVideos", get, set, kind: "like" }),

  toggleSave: (videoId) =>
    toggle({ key: videoId, dictKey: "savedVideos", get, set, kind: "save" }),

  toggleFollow: (creatorId) =>
    toggle({ key: creatorId, dictKey: "followedCreators", get, set, kind: "follow" }),

  toggleSavedCollection: (collectionId) =>
    toggle({
      key: collectionId,
      dictKey: "savedCollections",
      get,
      set,
      kind: "saved-collection",
    }),

  toggleBlock: async (targetId, block) => {
    const userId = get().userId;
    if (!userId) {
      window.location.assign("/login");
      return false;
    }

    const res = await fetch("/api/block", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetId, active: block }),
    });
    if (!res.ok) return false;

    const current = get();
    const nextBlocked = { ...current.blockedUsers };
    if (block) {
      nextBlocked[targetId] = true;
      // The server force-unfollows both directions on block — mirror that
      // locally so the UI doesn't wait for a full re-hydration to catch up.
      const nextFollowed = { ...current.followedCreators };
      delete nextFollowed[targetId];
      set({ blockedUsers: nextBlocked, followedCreators: nextFollowed });
    } else {
      delete nextBlocked[targetId];
      set({ blockedUsers: nextBlocked });
    }
    return true;
  },
}));
