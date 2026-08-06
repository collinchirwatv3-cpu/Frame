import { createClient } from "@/lib/supabase/client";
import type { Video } from "@/lib/types";

type Row = {
  id: string;
  playback_url: string | null;
  poster_url: string | null;
  title: string;
  description: string;
  category: Video["category"];
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

const SELECT = `
  id, playback_url, poster_url, title, description, category, sound_name,
  duration_seconds, width, height, badges,
  likes_count, comments_count, shares_count, saves_count,
  profiles ( id, username, display_name, avatar_url, banner_url, bio, website, verified, followers_count, following_count, total_views )
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

/** Recent public videos to browse when adding to a watch-together queue —
 * client-side filtered against the query, same pattern Explore already
 * uses (matchesVideoQuery) rather than a new server-side search feature. */
export async function fetchPublicVideos(limit = 30): Promise<Video[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("videos")
    .select(SELECT)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return (data as unknown as Row[]).map(toVideo).filter((v) => v !== null);
}
