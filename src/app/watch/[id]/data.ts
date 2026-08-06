import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type WatchPreview = {
  id: string;
  title: string;
  description: string;
  posterUrl: string;
  durationSeconds: number;
  creatorUsername: string;
};

type Row = {
  id: string;
  title: string;
  description: string;
  poster_url: string | null;
  duration_seconds: number;
  profiles: { username: string } | null;
};

/**
 * Server-side lookup for /watch/[id]'s metadata + OG image — was reading
 * from mock-data.ts's 5-item array, so notFound() fired for every real
 * uploaded video and this route (the public, crawlable, unfurl-friendly
 * share link) never actually worked for real content. Public share
 * previews only — explicitly re-checks visibility/processing_status rather
 * than relying on RLS alone, matching this route's own "never a private
 * video" contract.
 *
 * Wrapped in React's cache() — generateMetadata and the page component
 * both need this per request; without it that's two round trips instead
 * of one for every visit.
 */
export const fetchWatchPreview = cache(async (id: string): Promise<WatchPreview | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("videos")
    .select(
      "id, title, description, poster_url, duration_seconds, profiles!videos_creator_id_fkey(username)"
    )
    .eq("id", id)
    .eq("visibility", "public")
    .eq("processing_status", "ready")
    .single();

  if (error || !data) return null;
  const row = data as unknown as Row;
  if (!row.profiles || !row.poster_url) return null;

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    posterUrl: row.poster_url,
    durationSeconds: row.duration_seconds,
    creatorUsername: row.profiles.username,
  };
});
