"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useEngagementStore } from "@/store/engagement-store";
import { useCurrentUserStore } from "@/store/current-user-store";
import type { Creator } from "@/lib/types";

type ProfileRow = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  banner_url: string | null;
  bio: string;
  website: string | null;
  verified: boolean;
  statement: string | null;
  equipment: string[] | null;
  available_for_hire: boolean;
  followers_count: number;
  following_count: number;
  total_views: number;
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
    followers: row.followers_count,
    following: row.following_count,
    totalViews: row.total_views,
    verified: row.verified,
    statement: row.statement ?? undefined,
    equipment: row.equipment ?? undefined,
    availableForHire: row.available_for_hire,
  };
}

/**
 * Mounted once at the root layout. Two stores need to know who `auth.uid()`
 * is — engagement-store to hydrate/scope likes/saves/follows/saved-
 * collections, current-user-store to render the real logged-in identity
 * (SideRail, own profile) instead of a mock one. There's no other place in
 * the tree that observes auth state today, since the app is fully browsable
 * without logging in.
 */
export function AuthListener() {
  useEffect(() => {
    const supabase = createClient();
    const setUser = useEngagementStore.getState().setUser;
    const setProfile = useCurrentUserStore.getState().setProfile;

    async function syncProfile(userId: string | null) {
      setUser(userId);
      if (!userId) {
        setProfile(null);
        return;
      }
      const { data } = await supabase.from("profiles").select("*").eq("id", userId).single();
      setProfile(data ? toCreator(data as ProfileRow) : null);
    }

    supabase.auth.getUser().then(({ data }) => syncProfile(data.user?.id ?? null));

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      syncProfile(session?.user.id ?? null);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  return null;
}
