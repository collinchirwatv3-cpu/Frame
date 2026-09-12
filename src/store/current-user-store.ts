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
  /** Gates the Monetise upload option (UploadDropzone.tsx) — a UI nicety
   * only. The real enforcement is server-side (videos_insert_own RLS +
   * /api/uploads/route.ts), same "client claims, server re-derives"
   * posture as everything else in this store. False (not just falsy/null)
   * both when signed out and before the profile is fetched, same as every
   * other field here. */
  monetizationEligible: boolean;
  setProfile: (profile: Creator | null, inviteRedeemedAt: string | null, monetizationEligible: boolean) => void;
};

export const useCurrentUserStore = create<CurrentUserState>()((set) => ({
  profile: null,
  inviteRedeemedAt: null,
  monetizationEligible: false,
  setProfile: (profile, inviteRedeemedAt, monetizationEligible) =>
    set({ profile, inviteRedeemedAt, monetizationEligible }),
}));
