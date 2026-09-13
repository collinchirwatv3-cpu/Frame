import { createClient } from "@/lib/supabase/client";
import type { Creator } from "@/lib/types";

export type FollowProfile = Pick<Creator, "id" | "username" | "displayName" | "avatarUrl" | "verified">;

type EmbeddedProfileRow = {
  profiles: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    verified: boolean;
  } | null;
};

function toFollowProfile(row: EmbeddedProfileRow): FollowProfile | null {
  if (!row.profiles) return null;
  return {
    id: row.profiles.id,
    username: row.profiles.username,
    displayName: row.profiles.display_name,
    avatarUrl: row.profiles.avatar_url ?? "",
    verified: row.profiles.verified,
  };
}

/** Everyone following the given profile, newest first. A blocked pair's row
 * simply won't be here: profiles_select_all's RLS resolves the embed to
 * null for either side of a block, and toFollowProfile drops nulls — same
 * "fails gracefully" pattern as video-fetch.ts's toVideo/toCreator. */
export async function fetchFollowers(profileId: string, limit = 100): Promise<FollowProfile[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("follows")
    .select("created_at, profiles!follows_follower_id_fkey ( id, username, display_name, avatar_url, verified )")
    .eq("followee_id", profileId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return (data as unknown as EmbeddedProfileRow[]).map(toFollowProfile).filter((p) => p !== null);
}

/** Everyone the given profile follows, newest first. */
export async function fetchFollowing(profileId: string, limit = 100): Promise<FollowProfile[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("follows")
    .select("created_at, profiles!follows_followee_id_fkey ( id, username, display_name, avatar_url, verified )")
    .eq("follower_id", profileId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return (data as unknown as EmbeddedProfileRow[]).map(toFollowProfile).filter((p) => p !== null);
}

/** Accounts the signed-in caller has blocked — Settings' "Blocked Accounts"
 * list, the only place a block can be reversed from (a blocked profile is
 * otherwise unreachable via RLS, so there's no "Unblock" button on their
 * own page to find after leaving it). */
export async function fetchBlockedUsers(userId: string, limit = 200): Promise<FollowProfile[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("blocks")
    .select("created_at, profiles!blocks_blocked_id_fkey ( id, username, display_name, avatar_url, verified )")
    .eq("blocker_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return (data as unknown as EmbeddedProfileRow[]).map(toFollowProfile).filter((p) => p !== null);
}
