import { createClient } from "@/lib/supabase/client";
import type { Creator, Video } from "@/lib/types";

export type PartyVisibility = "public" | "private";
export type PartyRepeatRule = "none" | "daily" | "weekly";

export type WatchParty = {
  id: string;
  title: string;
  createdAt: string;
  host: Pick<Creator, "id" | "username" | "displayName" | "avatarUrl">;
  video: Pick<Video, "id" | "title" | "posterUrl"> | null;
  visibility: PartyVisibility;
  scheduledAt: string | null;
  repeatRule: PartyRepeatRule;
  lastNotifiedAt: string | null;
};

type Row = {
  id: string;
  title: string;
  created_at: string;
  visibility: PartyVisibility;
  scheduled_at: string | null;
  repeat_rule: PartyRepeatRule;
  last_notified_at: string | null;
  profiles: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
  } | null;
  videos: {
    id: string;
    title: string;
    poster_url: string | null;
  } | null;
};

// profiles!watch_parties_host_id_fkey / videos!watch_parties_video_id_fkey,
// not a bare embed — same reasoning as video-fetch.ts's SELECT: PostgREST
// needs the explicit constraint name whenever more than one relationship
// to the target table could exist, and being explicit here costs nothing.
const SELECT = `
  id, title, created_at, visibility, scheduled_at, repeat_rule, last_notified_at,
  profiles!watch_parties_host_id_fkey ( id, username, display_name, avatar_url ),
  videos!watch_parties_video_id_fkey ( id, title, poster_url )
`;

function toParty(row: Row): WatchParty | null {
  if (!row.profiles) return null;
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    visibility: row.visibility,
    scheduledAt: row.scheduled_at,
    repeatRule: row.repeat_rule,
    lastNotifiedAt: row.last_notified_at,
    host: {
      id: row.profiles.id,
      username: row.profiles.username,
      displayName: row.profiles.display_name,
      avatarUrl: row.profiles.avatar_url ?? "",
    },
    video: row.videos
      ? { id: row.videos.id, title: row.videos.title, posterUrl: row.videos.poster_url ?? "" }
      : null,
  };
}

/** Every PUBLIC party, newest first. Explicit .eq("visibility", "public")
 * here is defense-in-depth, not reliance on RLS alone — watch_parties_
 * select_visible (20260913010000) also lets any invited member read a
 * private row directly by id, which is correct for room access but must
 * not leak into this generic discovery listing. */
export async function fetchParties(limit = 30): Promise<WatchParty[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("watch_parties")
    .select(SELECT)
    .eq("visibility", "public")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return (data as unknown as Row[]).map(toParty).filter((p) => p !== null);
}

/** Parties the caller hosts, any visibility — there's no join/RSVP record
 * in this schema, so "your parties" can only ever mean "parties you host,"
 * not a full join history. */
export async function fetchMyParties(userId: string, limit = 30): Promise<WatchParty[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("watch_parties")
    .select(SELECT)
    .eq("host_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return (data as unknown as Row[]).map(toParty).filter((p) => p !== null);
}

/** Public parties hosted by someone the caller follows — same two-step
 * shape as fetchFollowingVideos in video-fetch.ts (follows has no direct FK
 * PostgREST can embed watch_parties through). */
export async function fetchFollowedParties(userId: string, limit = 30): Promise<WatchParty[]> {
  const supabase = createClient();
  const { data: follows } = await supabase.from("follows").select("followee_id").eq("follower_id", userId);
  const followeeIds = (follows ?? []).map((row) => row.followee_id as string);
  if (followeeIds.length === 0) return [];

  const { data, error } = await supabase
    .from("watch_parties")
    .select(SELECT)
    .in("host_id", followeeIds)
    .eq("visibility", "public")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return (data as unknown as Row[]).map(toParty).filter((p) => p !== null);
}

/** A single party by id — used to resolve a real party's title/schedule for
 * WatchTogetherPlayer's header. Returns null for an ad-hoc room (no
 * watch_parties row at all) as well as a genuinely missing/unreadable one;
 * callers fall back to the video's own title either way. */
export async function fetchPartyById(id: string): Promise<WatchParty | null> {
  const supabase = createClient();
  const { data, error } = await supabase.from("watch_parties").select(SELECT).eq("id", id).maybeSingle();
  if (error || !data) return null;
  return toParty(data as unknown as Row);
}

/** Creation goes through POST /api/parties, not a direct client insert —
 * watch_parties' INSERT grant is revoked for authenticated/anon
 * (supabase/migrations/20260914120000_lock_down_watch_party_creation.sql)
 * specifically so every scheduled party (a future notification fan-out to
 * the host's followers) passes through that route's rate limiting and
 * per-host cap. host_id isn't passed in the request body — the route
 * derives it from the verified session, never trusts the client for it. */
export async function createParty(params: {
  title: string;
  videoId: string;
  visibility?: PartyVisibility;
  scheduledAt?: string | null;
  repeatRule?: PartyRepeatRule;
}): Promise<WatchParty | null> {
  const res = await fetch("/api/parties", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: params.title,
      videoId: params.videoId,
      visibility: params.visibility ?? "public",
      scheduledAt: params.scheduledAt ?? null,
      repeatRule: params.repeatRule ?? "none",
    }),
  });
  if (!res.ok) return null;
  const { id } = (await res.json()) as { id: string };
  return fetchPartyById(id);
}

/** watch_parties_delete_own's `using (auth.uid() = host_id)` means a
 * non-host's delete matches zero rows rather than erroring — Postgres RLS
 * silently filters, it doesn't reject. A bare `!error` check can't tell
 * "actually deleted" apart from "matched nothing," which previously let a
 * caller who isn't really the host believe End Party worked (navigate away)
 * while the row was untouched. `.select("id")` forces the delete to report
 * which rows it actually touched, so this can tell the difference for real. */
export async function deleteParty(id: string): Promise<boolean> {
  const supabase = createClient();
  const { data, error } = await supabase.from("watch_parties").delete().eq("id", id).select("id");
  return !error && (data?.length ?? 0) > 0;
}
