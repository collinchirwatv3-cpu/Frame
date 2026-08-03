import { create } from "zustand";

type PlayerState = {
  muted: boolean;
  activeId: string | null;
  directorMode: boolean;
  toggleMuted: () => void;
  setActiveId: (id: string) => void;
  toggleDirectorMode: () => void;
  exitDirectorMode: () => void;
};

export const usePlayerStore = create<PlayerState>((set) => ({
  muted: true,
  activeId: null,
  directorMode: false,
  toggleMuted: () => set((s) => ({ muted: !s.muted })),
  setActiveId: (id) => set({ activeId: id }),
  toggleDirectorMode: () => set((s) => ({ directorMode: !s.directorMode })),
  exitDirectorMode: () => set({ directorMode: false }),
}));
