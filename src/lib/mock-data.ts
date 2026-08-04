import type { Category, Collection, Creator, Video } from "./types";

// Real content now lives in Supabase (see MIGRATION_PLAN.md). The demo
// creators/videos/collections that used to live here were seeded into the
// real DB and have since been removed — the app renders honest empty states
// (Home, Explore, Inbox, Profile) until real creators sign up and upload.
export const creators: Creator[] = [];

export const videos: Video[] = [];

export const categories: Category[] = [
  "Travel",
  "Cars",
  "Architecture",
  "Gaming",
  "Music",
  "Technology",
  "Sports",
  "Short Films",
  "Documentaries",
  "Nature",
];

// Grounded in content that actually exists — collections are platform-
// curated and only meaningful once there's real video content to group.
export const collections: Collection[] = [];

// Private videos never appear in `videos` — not in the feed, Explore, or the
// public profile grid. The only way to reach one is a share link generated
// from the Private tab on the owner's own profile.
export const privateVideos: Video[] = [];

export type DMThread = {
  id: string;
  creator: Creator;
  lastMessage: string;
  timestamp: string;
  unread: boolean;
};

export const dmThreads: DMThread[] = [];

export const notificationSummary = [
  { id: "likes", label: "Likes", count: 0 },
  { id: "comments", label: "Comments", count: 0 },
  { id: "followers", label: "Followers", count: 0 },
  { id: "mentions", label: "Mentions", count: 0 },
  { id: "system", label: "System", count: 0 },
];
