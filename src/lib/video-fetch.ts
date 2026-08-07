import { createClient } from "@/lib/supabase/client";
import type { Category, Creator, Video } from "@/lib/types";

type Row = {
  id: string;
  playback_url: string | null;
  poster_url: string | null;
  title: string;
  description: string;
  category: Video["category"];
  content_type: "film" | "short";
  sound_name: string | null;
  duration_seconds: number;
  width: number;
  height: number;
  badges: string[] | null;
  likes_count: number;
  comments_count: number;
  shares_count: number;
  saves_count: number;
  profiles: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    banner_url: string | null;
    bio: string;
    website: string | null;
    verified: boolean;
    followers_count: number;
    following_count: number;
    total_views: number;
  } | null;
};

// profiles!videos_creator_id_fkey, not a plain "profiles(...)" embed — with
// likes/saves/watch_progress also joining videos to profiles, PostgREST
// can't infer which relationship is meant and a bare embed 400s with
// PGRST201 ("more than one relationship was found"). Confirmed live.
const SELECT = `
  id, playback_url, poster_url, title, description, category, content_type, sound_name,
  duration_seconds, width, height, badges,
  likes_count, comments_count, shares_count, saves_count,
  profiles!videos_creator_id_fkey ( id, username, display_name, avatar_url, banner_url, bio, website, verified, followers_count, following_count, total_views )
`;

function toVideo(row: Row): Video | null {
  if (!row.playback_url || !row.poster_url || !row.profiles) return null;
  const creator = row.profiles;
  return {
    id: row.id,
    creator: {
      id: creator.id,
      username: creator.username,
      displayName: creator.display_name,
      avatarUrl: creator.avatar_url ?? "",
      bannerUrl: creator.banner_url ?? "",
      bio: creator.bio,
      website: creator.website ?? undefined,
      followers: creator.followers_count,
      following: creator.following_count,
      totalViews: creator.total_views,
      verified: creator.verified,
    },
    playbackUrl: row.playback_url,
    posterUrl: row.poster_url,
    title: row.title,
    description: row.description,
    category: row.category,
    contentType: row.content_type,
    soundName: row.sound_name ?? undefined,
    likes: row.likes_count,
    comments: row.comments_count,
    shares: row.shares_count,
    saves: row.saves_count,
    durationSeconds: row.duration_seconds,
    width: row.width,
    height: row.height,
    badges: (row.badges ?? []) as Video["badges"],
  };
}

/** Public, ready videos only — RLS (videos_select_public) already enforces
 * this, this just fails gracefully instead of returning a half-built Video. */
export async function fetchVideoById(id: string): Promise<Video | null> {
  const supabase = createClient();
  const { data, error } = await supabase.from("videos").select(SELECT).eq("id", id).single();
  if (error || !data) return null;
  return toVideo(data as unknown as Row);
}

/** Recent public films (content_type = 'film') — the cinematic library,
 * excludes shorts. Client-side query-filtered against `matchesVideoQuery`
 * by callers (Explore, watch-together's queue picker) rather than a new
 * server-side search feature. Optional `category` narrows server-side —
 * Home's category chip strip. */
export async function fetchPublicVideos(limit = 30, category?: Category): Promise<Video[]> {
  const supabase = createClient();
  let query = supabase.from("videos").select(SELECT).eq("content_type", "film");
  if (category) query = query.eq("category", category);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(limit);
  if (error || !data) return [];
  return (data as unknown as Row[]).map(toVideo).filter((v) => v !== null);
}

/** Recent public shorts (content_type = 'short') for the Shorts feed. */
export async function fetchShorts(limit = 30): Promise<Video[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("videos")
    .select(SELECT)
    .eq("content_type", "short")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return (data as unknown as Row[]).map(toVideo).filter((v) => v !== null);
}

type EmbeddedVideoRow = { videos: Row | null };

/** This user's saved films, most recently saved first — the "Saved" tab of
 * Home. `videos!inner` (not a plain embed) so .eq("videos.content_type", …)
 * actually filters which saves rows come back, not just nulls out the
 * embed on non-matching ones — same reason `category` filters the same way. */
export async function fetchSavedVideos(
  userId: string,
  limit = 20,
  category?: Category
): Promise<Video[]> {
  const supabase = createClient();
  let query = supabase
    .from("saves")
    .select(`videos!inner ( ${SELECT} )`)
    .eq("user_id", userId)
    .eq("videos.content_type", "film");
  if (category) query = query.eq("videos.category", category);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(limit);
  if (error || !data) return [];
  return (data as unknown as EmbeddedVideoRow[])
    .map((row) => (row.videos ? toVideo(row.videos) : null))
    .filter((v) => v !== null);
}

/** This user's watch history, most recently watched first — the "History"
 * tab of Home. Written by VideoCard.tsx when a video scrolls out of view
 * (upserts watch_progress). */
export async function fetchHistoryVideos(
  userId: string,
  limit = 20,
  category?: Category
): Promise<Video[]> {
  const supabase = createClient();
  let query = supabase
    .from("watch_progress")
    .select(`videos!inner ( ${SELECT} )`)
    .eq("user_id", userId)
    .eq("videos.content_type", "film");
  if (category) query = query.eq("videos.category", category);
  const { data, error } = await query.order("updated_at", { ascending: false }).limit(limit);
  if (error || !data) return [];
  return (data as unknown as EmbeddedVideoRow[])
    .map((row) => (row.videos ? toVideo(row.videos) : null))
    .filter((v) => v !== null);
}

/** Recent films from creators this user follows, newest first — the
 * "Following" tab of Home. Two-step, same reasoning as fetchDiscoverVideos:
 * `follows` has no direct FK to `videos` (it references profiles via
 * followee_id), so there's no single-level PostgREST embed shape for this —
 * fetch followee ids, then films by those creators, both RLS-scoped to
 * public+ready under the hood same as every other read here. */
export async function fetchFollowingVideos(
  userId: string,
  limit = 20,
  category?: Category
): Promise<Video[]> {
  const supabase = createClient();
  const { data: follows } = await supabase
    .from("follows")
    .select("followee_id")
    .eq("follower_id", userId);
  const followeeIds = (follows ?? []).map((row) => row.followee_id as string);
  if (followeeIds.length === 0) return [];

  let query = supabase
    .from("videos")
    .select(SELECT)
    .eq("content_type", "film")
    .in("creator_id", followeeIds);
  if (category) query = query.eq("category", category);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(limit);
  if (error || !data) return [];
  return (data as unknown as Row[]).map(toVideo).filter((v) => v !== null);
}

/** Public films the given user hasn't watched yet (or every recent public
 * film, for a signed-out/anonymous caller) — Discover's full-screen feed.
 * Two-step rather than a single query: PostgREST's JS client doesn't expose
 * a NOT IN (subquery) filter, so watched ids are fetched first and excluded
 * client-side via .not("id", "in", ...). Fine at this catalog size; would
 * need a real view/RPC if a user's history ever gets large. */
export async function fetchDiscoverVideos(userId: string | null, limit = 50): Promise<Video[]> {
  const supabase = createClient();

  let watchedIds: string[] = [];
  if (userId) {
    const { data } = await supabase
      .from("watch_progress")
      .select("video_id")
      .eq("user_id", userId);
    watchedIds = (data ?? []).map((row) => row.video_id as string);
  }

  let query = supabase
    .from("videos")
    .select(SELECT)
    .eq("content_type", "film")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (watchedIds.length > 0) {
    query = query.not("id", "in", `(${watchedIds.join(",")})`);
  }

  const { data, error } = await query;
  if (error || !data) return [];
  return (data as unknown as Row[]).map(toVideo).filter((v) => v !== null);
}

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

/** Any creator's public profile by username — for viewing someone else's
 * profile (unlike current-user-store's own profile, this is read-only and
 * never the signed-in viewer's own row). */
export async function fetchProfileByUsername(username: string): Promise<Creator | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, username, display_name, avatar_url, banner_url, bio, website, verified, statement, equipment, available_for_hire, followers_count, following_count, total_views"
    )
    .eq("username", username)
    .single();
  if (error || !data) return null;
  return toCreator(data as ProfileRow);
}

/** A specific creator's public, ready videos (both films and shorts) for
 * their public profile page — newest first. */
export async function fetchCreatorPublicVideos(creatorId: string, limit = 50): Promise<Video[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("videos")
    .select(SELECT)
    .eq("creator_id", creatorId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return (data as unknown as Row[]).map(toVideo).filter((v) => v !== null);
}
