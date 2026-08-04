import { create } from "zustand";
import { persist } from "zustand/middleware";

type InviteState = {
  /** A code that passed the pre-auth /api/invite/validate check. Not proof
   * of membership by itself — AuthListener redeems it for real (atomically,
   * server-side) the moment a session exists, then clears this. */
  validatedCode: string | null;
  hasHydrated: boolean;
  setHasHydrated: (v: boolean) => void;
  setValidatedCode: (code: string) => void;
  clearValidatedCode: () => void;
};

export const useInviteStore = create<InviteState>()(
  persist(
    (set) => ({
      validatedCode: null,
      hasHydrated: false,
      setHasHydrated: (v) => set({ hasHydrated: v }),
      setValidatedCode: (code) => set({ validatedCode: code }),
      clearValidatedCode: () => set({ validatedCode: null }),
    }),
    {
      name: "frame-invite",
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
