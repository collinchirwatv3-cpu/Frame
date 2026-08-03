import { create } from "zustand";
import { persist } from "zustand/middleware";
import { generateToken, TTL_MS } from "@/lib/share-links";
import type { ShareLink, ShareLinkTTL } from "@/lib/types";

type ShareLinksState = {
  links: ShareLink[];
  hasHydrated: boolean;
  setHasHydrated: (v: boolean) => void;
  createLink: (videoId: string, ttl: ShareLinkTTL) => ShareLink;
  revokeLink: (token: string) => void;
  recordView: (token: string) => void;
  linksForVideo: (videoId: string) => ShareLink[];
};

export const useShareLinksStore = create<ShareLinksState>()(
  persist(
    (set, get) => ({
      links: [],
      hasHydrated: false,
      setHasHydrated: (v) => set({ hasHydrated: v }),
      createLink: (videoId, ttl) => {
        const now = Date.now();
        const link: ShareLink = {
          token: generateToken(),
          videoId,
          createdAt: now,
          expiresAt: now + TTL_MS[ttl],
          revokedAt: null,
          viewCount: 0,
        };
        set((s) => ({ links: [link, ...s.links] }));
        return link;
      },
      revokeLink: (token) =>
        set((s) => ({
          links: s.links.map((l) => (l.token === token ? { ...l, revokedAt: Date.now() } : l)),
        })),
      recordView: (token) =>
        set((s) => ({
          links: s.links.map((l) =>
            l.token === token ? { ...l, viewCount: l.viewCount + 1 } : l
          ),
        })),
      linksForVideo: (videoId) => get().links.filter((l) => l.videoId === videoId),
    }),
    {
      name: "frame-share-links",
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
