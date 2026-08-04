import { create } from "zustand";

type PlayerState = {
  muted: boolean;
  activeId: string | null;
  directorMode: boolean;
  /** True while a scrub-bar drag is in progress — SwipeFeed's auto-hide
   * countdown checks this so Director Mode never engages mid-drag. */
  isScrubbing: boolean;
  toggleMuted: () => void;
  setActiveId: (id: string) => void;
  toggleDirectorMode: () => void;
  enterDirectorMode: () => void;
  exitDirectorMode: () => void;
  setScrubbing: (v: boolean) => void;
};

export const usePlayerStore = create<PlayerState>((set) => ({
  muted: true,
  activeId: null,
  directorMode: false,
  isScrubbing: false,
  toggleMuted: () => set((s) => ({ muted: !s.muted })),
  setActiveId: (id) => set({ activeId: id }),
  toggleDirectorMode: () => set((s) => ({ directorMode: !s.directorMode })),
  enterDirectorMode: () => set({ directorMode: true }),
  exitDirectorMode: () => set({ directorMode: false }),
  setScrubbing: (v) => set({ isScrubbing: v }),
}));
