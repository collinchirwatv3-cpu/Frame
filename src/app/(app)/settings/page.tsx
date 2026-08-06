"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Trash2, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import { SearchButton } from "@/components/ui/SearchButton";
import { categories } from "@/lib/mock-data";
import { useOnboardingStore } from "@/store/onboarding-store";
import { usePlayerStore } from "@/store/player-store";
import { createClient } from "@/lib/supabase/client";
import { DeleteAccountDialog } from "@/components/settings/DeleteAccountDialog";
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
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

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
    } catch (err) {
      // The SDK clears local session state as part of signOut() regardless
      // of whether the server-side invalidation call succeeds, so leaving
      // the user stuck on Settings after a network hiccup would be worse
      // than redirecting with a possibly-still-valid server session — that
      // session expires on its own, and the client no longer presents it.
      console.error("Sign out request failed, redirecting anyway:", err);
    }
    router.replace("/login");
  }

  return (
    <div className="pb-24 md:pb-8">
      <div className="flex items-center justify-between px-6 pt-8 pb-6">
        <h1 className="text-2xl font-bold">Settings</h1>
        <SearchButton className="bg-card border border-border" />
      </div>

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
        <ul className="flex flex-col gap-2.5 text-sm">
          <li>
            <Link href="/terms" className="text-text-secondary hover:text-accent transition-colors">
              Terms of Service
            </Link>
          </li>
          <li>
            <Link href="/privacy" className="text-text-secondary hover:text-accent transition-colors">
              Privacy Policy
            </Link>
          </li>
          <li>
            <Link
              href="/community-guidelines"
              className="text-text-secondary hover:text-accent transition-colors"
            >
              Community Guidelines
            </Link>
          </li>
          <li>
            <Link href="/cookies" className="text-text-secondary hover:text-accent transition-colors">
              Cookie Policy
            </Link>
          </li>
          <li>
            <Link href="/contact" className="text-text-secondary hover:text-accent transition-colors">
              Contact
            </Link>
          </li>
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

      <SettingsSection title="Danger zone">
        <p className="text-sm text-text-secondary mb-3">
          Permanently delete your account, videos, and all activity. This can&apos;t be undone.
        </p>
        <button
          onClick={() => setDeleteDialogOpen(true)}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-full border border-primary/40 text-sm font-medium text-primary hover:bg-primary/10 transition-colors"
        >
          <Trash2 size={15} />
          Delete account
        </button>
      </SettingsSection>

      <DeleteAccountDialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)} />
    </div>
  );
}
