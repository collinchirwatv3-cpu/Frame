"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useOnboardingStore } from "@/store/onboarding-store";

export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const hasHydrated = useOnboardingStore((s) => s.hasHydrated);
  const completed = useOnboardingStore((s) => s.completed);
  const router = useRouter();

  useEffect(() => {
    if (hasHydrated && !completed) {
      router.replace("/onboarding");
    }
  }, [hasHydrated, completed, router]);

  // Wait for the localStorage check before rendering anything — avoids a
  // flash of the real feed for first-time visitors who are about to be
  // redirected, and avoids incorrectly bouncing already-onboarded users.
  if (!hasHydrated || !completed) return null;

  return <>{children}</>;
}
