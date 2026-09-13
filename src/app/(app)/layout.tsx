import { BottomNav } from "@/components/nav/BottomNav";
import { SideRail } from "@/components/nav/SideRail";
import { LandscapeSideRail } from "@/components/nav/LandscapeSideRail";
import { AppMainContent } from "@/components/nav/AppMainContent";
import { OnboardingGate } from "@/components/onboarding/OnboardingGate";

// ProfileFloat lives on Home specifically ((app)/page.tsx), not here — it
// used to be global to every app-shell page, scoped back to just Home.
export default function AppShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <OnboardingGate>
      <div className="flex w-full">
        <SideRail />
        <AppMainContent>{children}</AppMainContent>
        <BottomNav />
        <LandscapeSideRail />
      </div>
    </OnboardingGate>
  );
}
