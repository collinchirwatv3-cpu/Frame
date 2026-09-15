"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, ShieldAlert, ShieldOff, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { categories } from "@/lib/categories";
import { useOnboardingStore } from "@/store/onboarding-store";
import { createClient } from "@/lib/supabase/client";
import { useIsModerator } from "@/lib/use-is-moderator";
import { useCurrentUserStore } from "@/store/current-user-store";
import { DeleteAccountDialog } from "@/components/settings/DeleteAccountDialog";
import { PushNotificationSettings } from "@/components/settings/PushNotificationSettings";
import { Switch } from "@/components/ui/Switch";
import {
  fetchNotificationPreferences,
  saveNotificationPreferences,
  type NotificationPreferences,
} from "@/lib/notification-preferences";
import { unsubscribeFromPush } from "@/lib/push";
import type { Category } from "@/lib/types";

const DEFAULT_PREFERENCES: NotificationPreferences = { partyStarting: true, comments: true, follows: true };

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
  const moderatorStatus = useIsModerator();
  const userId = useCurrentUserStore((s) => s.profile?.id ?? null);
  const interests = useOnboardingStore((s) => s.interests);
  const setInterests = useOnboardingStore((s) => s.complete);
  const [signingOut, setSigningOut] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPreferences>(DEFAULT_PREFERENCES);
  const [prefsError, setPrefsError] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchNotificationPreferences(userId).then((prefs) => {
      if (!cancelled) setNotificationPrefs(prefs);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function updatePreference(key: keyof NotificationPreferences, value: boolean) {
    if (!userId) return;
    const previous = notificationPrefs;
    const next = { ...previous, [key]: value };
    setNotificationPrefs(next);
    setPrefsError(false);
    const ok = await saveNotificationPreferences(userId, next);
    if (!ok) {
      setNotificationPrefs(previous);
      setPrefsError(true);
    }
  }

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
      // Detach this device's push subscription from the current account
      // *before* the session is cleared — signOut() invalidates the
      // client's auth token, and removing the server-side row requires an
      // authenticated call. Skipping this would leave a shared device
      // still registered to the account that's signing out, so the next
      // person to sign in on it would silently receive the previous
      // account's message notifications.
      await unsubscribeFromPush();
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
      <div className="px-6 pt-8 pb-6">
        <h1 className="text-2xl font-bold">Settings</h1>
      </div>

      <SettingsSection title="Interests">
        <p className="text-sm text-text-secondary mb-3">
          Tell us what you&apos;re into — change these anytime.
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

      <SettingsSection title="Notifications">
        <div className="flex flex-col gap-4">
          <div className="w-full flex items-center justify-between">
            <span className="text-sm">Frame Party starts</span>
            <Switch
              checked={notificationPrefs.partyStarting}
              onChange={(v) => updatePreference("partyStarting", v)}
              label="Frame Party starts"
            />
          </div>
          <div className="w-full flex items-center justify-between">
            <span className="text-sm">Comments on your Frames</span>
            <Switch
              checked={notificationPrefs.comments}
              onChange={(v) => updatePreference("comments", v)}
              label="Comments on your Frames"
            />
          </div>
          <div className="w-full flex items-center justify-between">
            <span className="text-sm">New followers</span>
            <Switch
              checked={notificationPrefs.follows}
              onChange={(v) => updatePreference("follows", v)}
              label="New followers"
            />
          </div>
          {prefsError && (
            <p className="text-xs text-primary">Couldn&apos;t save that — try again.</p>
          )}
        </div>
      </SettingsSection>

      <SettingsSection title="Push Notifications">
        <PushNotificationSettings />
      </SettingsSection>

      <SettingsSection title="Privacy">
        <Link
          href="/settings/blocked"
          className="flex items-center gap-2 text-sm text-text-secondary hover:text-accent transition-colors"
        >
          <ShieldOff size={15} />
          Blocked Accounts
        </Link>
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

      {moderatorStatus === "moderator" && (
        <SettingsSection title="Moderation">
          <Link
            href="/moderation"
            className="flex items-center gap-2 text-sm text-primary hover:underline underline-offset-2"
          >
            <ShieldAlert size={15} />
            Review reports
          </Link>
        </SettingsSection>
      )}

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
          Permanently delete your account, Frames, and all activity. This can&apos;t be undone.
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
