import { create } from "zustand";
import { persist } from "zustand/middleware";

type EngagementState = {
  likedVideos: Record<string, boolean>;
  savedVideos: Record<string, boolean>;
  followedCreators: Record<string, boolean>;
  savedCollections: Record<string, boolean>;
  toggleLike: (videoId: string) => void;
  toggleSave: (videoId: string) => void;
  toggleFollow: (creatorId: string) => void;
  toggleSavedCollection: (collectionId: string) => void;
};

export const useEngagementStore = create<EngagementState>()(
  persist(
    (set) => ({
      likedVideos: {},
      savedVideos: {},
      followedCreators: {},
      savedCollections: {},
      toggleLike: (videoId) =>
        set((s) => ({ likedVideos: { ...s.likedVideos, [videoId]: !s.likedVideos[videoId] } })),
      toggleSave: (videoId) =>
        set((s) => ({ savedVideos: { ...s.savedVideos, [videoId]: !s.savedVideos[videoId] } })),
      toggleFollow: (creatorId) =>
        set((s) => ({
          followedCreators: {
            ...s.followedCreators,
            [creatorId]: !s.followedCreators[creatorId],
          },
        })),
      toggleSavedCollection: (collectionId) =>
        set((s) => ({
          savedCollections: {
            ...s.savedCollections,
            [collectionId]: !s.savedCollections[collectionId],
          },
        })),
    }),
    { name: "frame-engagement" }
  )
);
