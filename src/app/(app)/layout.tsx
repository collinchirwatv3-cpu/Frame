import { BottomNav } from "@/components/nav/BottomNav";
import { SideRail } from "@/components/nav/SideRail";
import { OnboardingGate } from "@/components/onboarding/OnboardingGate";

export default function AppShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <OnboardingGate>
      <div className="flex w-full">
        <SideRail />
        <main className="flex-1 min-w-0">{children}</main>
        <BottomNav />
      </div>
    </OnboardingGate>
  );
}
