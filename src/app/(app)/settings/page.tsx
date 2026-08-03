"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import { categories } from "@/lib/mock-data";
import { useOnboardingStore } from "@/store/onboarding-store";
import { usePlayerStore } from "@/store/player-store";
import { createClient } from "@/lib/supabase/client";
import type { Category } from "@/lib/types";

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-6 py-5 border-b border-border">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-text-secondary mb-3">
        {title}
      </h2>
      {children}
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const interests = useOnboardingStore((s) => s.interests);
  const setInterests = useOnboardingStore((s) => s.complete);
  const muted = usePlayerStore((s) => s.muted);
  const toggleMuted = usePlayerStore((s) => s.toggleMuted);
  const [signingOut, setSigningOut] = useState(false);

  function toggleInterest(category: Category) {
    setInterests(
      interests.includes(category)
        ? interests.filter((c) => c !== category)
        : [...interests, category]
    );
  }

  async function handleSignOut() {
    setSigningOut(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch {
      // Auth isn't configured with real keys yet — nothing to sign out of.
    }
    router.replace("/login");
  }

  return (
    <div className="pb-24 md:pb-8">
      <h1 className="text-2xl font-bold px-6 pt-8 pb-6">Settings</h1>

      <SettingsSection title="Interests">
        <p className="text-sm text-text-secondary mb-3">
          Shapes what shows up in Discover — change these anytime.
        </p>
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => {
            const active = interests.includes(c);
            return (
              <button
                key={c}
                onClick={() => toggleInterest(c)}
                aria-pressed={active}
                className={cn(
                  "px-3.5 py-1.5 rounded-full text-xs font-medium border transition-colors",
                  active
                    ? "bg-primary text-bg border-primary"
                    : "border-border text-text-secondary hover:text-accent"
                )}
              >
                {c}
              </button>
            );
          })}
        </div>
      </SettingsSection>

      <SettingsSection title="Playback">
        <button
          onClick={toggleMuted}
          className="w-full flex items-center justify-between py-1"
        >
          <span className="text-sm">Sound on by default</span>
          <span className="flex items-center gap-2 text-xs text-text-secondary">
            {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
            {muted ? "Off" : "On"}
          </span>
        </button>
      </SettingsSection>

      <SettingsSection title="About">
        <ul className="flex flex-col gap-2.5 text-sm text-text-secondary">
          <li>Terms of Service — coming soon</li>
          <li>Privacy Policy — coming soon</li>
          <li>Content & DMCA Policy — coming soon</li>
        </ul>
      </SettingsSection>

      <div className="px-6 py-5">
        <button
          onClick={handleSignOut}
          disabled={signingOut}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-full border border-border text-sm font-medium text-primary hover:bg-card transition-colors disabled:opacity-50"
        >
          <LogOut size={15} />
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </div>
  );
}
