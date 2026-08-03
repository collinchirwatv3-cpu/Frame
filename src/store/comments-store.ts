import { create } from "zustand";
import { persist } from "zustand/middleware";
import { currentUser } from "@/lib/mock-data";

export type Comment = {
  id: string;
  author: string;
  avatarUrl: string;
  text: string;
  timestamp: string;
};

type CommentsState = {
  byVideoId: Record<string, Comment[]>;
  addComment: (videoId: string, text: string) => void;
};

export const useCommentsStore = create<CommentsState>()(
  persist(
    (set) => ({
      byVideoId: {},
      addComment: (videoId, text) =>
        set((s) => ({
          byVideoId: {
            ...s.byVideoId,
            [videoId]: [
              ...(s.byVideoId[videoId] ?? []),
              {
                id: `local-${Date.now()}`,
                author: currentUser.username,
                avatarUrl: currentUser.avatarUrl,
                text,
                timestamp: "now",
              },
            ],
          },
        })),
    }),
    { name: "frame-comments" }
  )
);
