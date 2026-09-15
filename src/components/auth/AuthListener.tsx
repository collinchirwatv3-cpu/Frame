"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useEngagementStore } from "@/store/engagement-store";
import { useCurrentUserStore } from "@/store/current-user-store";
import { useInviteStore } from "@/store/invite-store";
import { useTagsStore } from "@/store/tags-store";
import type { Creator } from "@/lib/types";

type ProfileRow = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  banner_url: string | null;
  bio: string;
  website: string | null;
  instagram_handle: string | null;
  verified: boolean;
  premium_status: Creator["premiumStatus"] | null;
  statement: string | null;
  equipment: string[] | null;
  available_for_hire: boolean;
  followers_count: number;
  following_count: number;
  total_views: number;
  invite_redeemed_at: string | null;
  monetization_eligible: boolean;
};

function toCreator(row: ProfileRow): Creator {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url ?? "",
    bannerUrl: row.banner_url ?? "",
    bio: row.bio,
    website: row.website ?? undefined,
    instagramHandle: row.instagram_handle ?? undefined,
    followers: row.followers_count,
    following: row.following_count,
    totalViews: row.total_views,
    verified: row.verified,
    premiumStatus: row.premium_status ?? undefined,
    statement: row.statement ?? undefined,
    equipment: row.equipment ?? undefined,
    availableForHire: row.available_for_hire,
  };
}

/**
 * Mounted once at the root layout. Three stores need to know who
 * `auth.uid()` is — engagement-store to hydrate/scope likes/saves/follows/
 * saved-collections, current-user-store to render the real logged-in
 * identity (SideRail, own profile) instead of a mock one, and this is also
 * where a pending invite code (InviteGate validated it pre-auth, but never
 * consumed it) gets redeemed for real the moment a session exists.
 */
export function AuthListener() {
  useEffect(() => {
    const supabase = createClient();
    const setUser = useEngagementStore.getState().setUser;
    const setProfile = useCurrentUserStore.getState().setProfile;

    // supabase.auth.getUser() below AND onAuthStateChange's own initial
    // firing (INITIAL_SESSION, sometimes followed by TOKEN_REFRESHED) both
    // run on a single mount, so syncProfile can fire several times per page
    // load — confirmed live: a stale/unredeemable pending code was hitting
    // /api/invite/redeem up to 4x per reload, tripping its rate limiter
    // within a couple of reloads (authRateLimiter, 5/min) and returning
    // 429s. /api/invite/redeem's own comment says it's meant to be "called
    // once, right after first login" — this flag actually enforces that,
    // scoped to this mount (a real page reload naturally resets it, which
    // is the right scope: a transient failure deserves another try on the
    // next real visit, not an infinite retry loop within one).
    let redeemAttempted = false;

    async function syncProfile(userId: string | null) {
      setUser(userId);
      // A video's tags are readable-but-RLS-scoped (a not-yet-public/own
      // video's tags are only visible to its owner) — clearing the tags
      // cache on every identity change (including sign-out) stops a
      // previous session's cached fetch from leaking into the next one
      // sharing this browser tab.
      useTagsStore.getState().reset();
      if (!userId) {
        setProfile(null, null, false);
        return;
      }

      let { data } = await supabase.from("profiles").select("*").eq("id", userId).single();

      const pendingCode = useInviteStore.getState().validatedCode;
      if (data && !data.invite_redeemed_at && pendingCode && !redeemAttempted) {
        redeemAttempted = true;
        try {
          const res = await fetch("/api/invite/redeem", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code: pendingCode }),
          });
          if (res.ok) {
            useInviteStore.getState().clearValidatedCode();
            ({ data } = await supabase.from("profiles").select("*").eq("id", userId).single());
          } else if (res.status !== 429) {
            // A definitive rejection (invalid/expired/already-used code,
            // not "rate limited, try again shortly") — clear it so a stale
            // code doesn't just get silently reattempted forever; the
            // invite gate lets the user enter a real one.
            useInviteStore.getState().clearValidatedCode();
          }
        } catch {
          // Network failure reaching our own route — leave the pending
          // code in place for a real retry later. Falls through to
          // setProfile below regardless, which is the actual fix: this used
          // to have no try/catch at all, so a thrown fetch here left
          // setProfile never called and the signed-in profile stuck
          // unresolved — which is exactly what "looks logged out" means
          // from the rest of the app's perspective.
        }
      }

      const row = data as ProfileRow | null;
      setProfile(row ? toCreator(row) : null, row?.invite_redeemed_at ?? null, row?.monetization_eligible ?? false);
    }

    supabase.auth.getUser().then(({ data }) => syncProfile(data.user?.id ?? null));

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      syncProfile(session?.user.id ?? null);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  return null;
}
