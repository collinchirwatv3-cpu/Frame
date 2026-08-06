import { createClient } from "@/lib/supabase/client";
import type { Category, Video } from "@/lib/types";

export type OwnVideoStatus = "uploading" | "processing" | "ready" | "failed";

/**
 * A creator's own video row, including in-flight uploads that haven't
 * finished encoding yet — playback_url/poster_url are null until Cloudflare
 * Stream's webhook fills them in (supabase/migrations/20260805000000_upload_pipeline.sql),
 * so this can't just be the shared `Video` type, which assumes those fields
 * always exist.
 */
export type OwnVideo = {
  id: string;
  title: string;
  description: string;
  category: Category;
  status: OwnVideoStatus;
  visibility: "public" | "private";
  posterUrl: string | null;
  width: number;
  height: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  createdAt: string;
};

type OwnVideoRow = {
  id: string;
  title: string;
  description: string;
  category: Category;
  processing_status: OwnVideoStatus;
  visibility: "public" | "private";
  poster_url: string | null;
  width: number;
  height: number;
  likes_count: number;
  comments_count: number;
  shares_count: number;
  saves_count: number;
  created_at: string;
};

// Explicit column list, never `*` — quality_score must never reach a
// client-facing response (see the column's own comment in
// 20260101000000_init.sql). playback_url is left out too: nothing here
// plays a video inline, cards just link to `/?v=<id>`.
const SELECT_COLUMNS =
  "id, title, description, category, processing_status, visibility, poster_url, width, height, likes_count, comments_count, shares_count, saves_count, created_at";

export async function fetchOwnVideos(userId: string): Promise<OwnVideo[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("videos")
    .select(SELECT_COLUMNS)
    .eq("creator_id", userId)
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  return (data as unknown as OwnVideoRow[]).map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    status: row.processing_status,
    visibility: row.visibility,
    posterUrl: row.poster_url,
    width: row.width,
    height: row.height,
    likes: row.likes_count,
    comments: row.comments_count,
    shares: row.shares_count,
    saves: row.saves_count,
    createdAt: row.created_at,
  }));
}

/** Bridges a ready OwnVideo into the shared `Video` shape for components
 * built against it (TrendingGrid, FeaturedWork) — the only place that
 * conversion happens. Returns null for anything not yet playable. */
export function toDisplayVideo(video: OwnVideo, creator: Video["creator"]): Video | null {
  if (video.status !== "ready" || !video.posterUrl) return null;
  return {
    id: video.id,
    creator,
    playbackUrl: "",
    posterUrl: video.posterUrl,
    title: video.title,
    description: video.description,
    category: video.category,
    likes: video.likes,
    comments: video.comments,
    shares: video.shares,
    saves: video.saves,
    durationSeconds: 0,
    width: video.width,
    height: video.height,
  };
}
