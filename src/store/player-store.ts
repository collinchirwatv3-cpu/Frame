import { create } from "zustand";

type PlayerState = {
  muted: boolean;
  activeId: string | null;
  directorMode: boolean;
  /** True while a scrub-bar drag is in progress — SwipeFeed's auto-hide
   * countdown checks this so Director Mode never engages mid-drag. */
  isScrubbing: boolean;
  /** A one-time "tap to show controls" hint SwipeFeed shows the first time
   * chrome ever auto-hides in this browser. Lives here (not local component
   * state) so leaving Director Mode — via toggleDirectorMode's tap handler
   * in VideoCard, a different component — can clear it in the same atomic
   * update rather than a separate effect reacting to directorMode changing
   * (React Compiler flags synchronous setState directly in an effect body;
   * colocating both here avoids needing that effect at all). */
  showDirectorModeHint: boolean;
  toggleMuted: () => void;
  setActiveId: (id: string) => void;
  toggleDirectorMode: () => void;
  enterDirectorMode: () => void;
  exitDirectorMode: () => void;
  setScrubbing: (v: boolean) => void;
  setShowDirectorModeHint: (v: boolean) => void;
};

export const usePlayerStore = create<PlayerState>((set) => ({
  muted: true,
  activeId: null,
  directorMode: false,
  isScrubbing: false,
  showDirectorModeHint: false,
  toggleMuted: () => set((s) => ({ muted: !s.muted })),
  setActiveId: (id) => set({ activeId: id }),
  toggleDirectorMode: () =>
    set((s) => {
      const next = !s.directorMode;
      // Only ever clears on the way OUT of Director Mode — the hint
      // fulfills its own promise ("a tap brings chrome back") the moment
      // that's demonstrably true, never dismissed by entering.
      return { directorMode: next, showDirectorModeHint: next ? s.showDirectorModeHint : false };
    }),
  enterDirectorMode: () => set({ directorMode: true }),
  exitDirectorMode: () => set({ directorMode: false, showDirectorModeHint: false }),
  setScrubbing: (v) => set({ isScrubbing: v }),
  setShowDirectorModeHint: (v) => set({ showDirectorModeHint: v }),
}));
