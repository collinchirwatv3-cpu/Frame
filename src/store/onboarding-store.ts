import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Category } from "@/lib/types";

type OnboardingState = {
  completed: boolean;
  interests: Category[];
  hasHydrated: boolean;
  setHasHydrated: (v: boolean) => void;
  complete: (interests: Category[]) => void;
};

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      completed: false,
      interests: [],
      hasHydrated: false,
      setHasHydrated: (v) => set({ hasHydrated: v }),
      complete: (interests) => set({ completed: true, interests }),
    }),
    {
      name: "frame-onboarding",
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
