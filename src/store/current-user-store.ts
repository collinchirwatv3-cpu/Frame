import { create } from "zustand";
import type { Creator } from "@/lib/types";

type CurrentUserState = {
  /** The real logged-in user's profile, mapped to the client Creator shape.
   * Null both when signed out and before AuthListener has resolved the
   * session — UI treats both as "not logged in" until proven otherwise. */
  profile: Creator | null;
  /** Null until an authenticated profile has actually been fetched — check
   * engagement-store's `hydrated` (the shared "auth check finished" signal)
   * before treating a null here as "hasn't redeemed," not just "unknown." */
  inviteRedeemedAt: string | null;
  setProfile: (profile: Creator | null, inviteRedeemedAt: string | null) => void;
};

export const useCurrentUserStore = create<CurrentUserState>()((set) => ({
  profile: null,
  inviteRedeemedAt: null,
  setProfile: (profile, inviteRedeemedAt) => set({ profile, inviteRedeemedAt }),
}));
