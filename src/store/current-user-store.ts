import { create } from "zustand";
import type { Creator } from "@/lib/types";

type CurrentUserState = {
  /** The real logged-in user's profile, mapped to the client Creator shape.
   * Null both when signed out and before AuthListener has resolved the
   * session — UI treats both as "not logged in" until proven otherwise. */
  profile: Creator | null;
  setProfile: (profile: Creator | null) => void;
};

export const useCurrentUserStore = create<CurrentUserState>()((set) => ({
  profile: null,
  setProfile: (profile) => set({ profile }),
}));
