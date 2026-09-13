export type Creator = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  bannerUrl: string;
  bio: string;
  website?: string;
  instagramHandle?: string;
  followers: number;
  following: number;
  totalViews: number;
  verified?: boolean;
  /** profiles.premium_status — real, existing schema, but no real user can
   * ever be "active" until a Stripe/StoreKit purchase flow ships. A profile
   * showing the Premium badge is expected to be rare/nonexistent for now,
   * not a bug. */
  premiumStatus?: "inactive" | "pending_checkout" | "active" | "canceled";
  /** Portfolio framing — optional, shown when a creator has filled it in. */
  statement?: string;
  equipment?: string[];
  availableForHire?: boolean;
};

export type Category =
  | "Travel"
  | "Cars"
  | "Architecture"
  | "Gaming"
  | "Music"
  | "Technology"
  | "Sports"
  | "Short Films"
  | "Documentaries"
  | "Nature";

export type Badge =
  | "FRAMES Certified"
  | "4K"
  | "HDR"
  | "Dolby Vision"
  | "Spatial Audio"
  | "21:9 Cinema"
  | "Drone"
  | "Shot on RED"
  | "Shot on Sony"
  | "Shot on Blackmagic";

/** Every field optional — creators decide what to expose per video. */
export type VideoDetails = {
  camera?: string;
  lens?: string;
  fps?: number;
  codec?: string;
  location?: string;
  creatorNotes?: string;
  behindTheScenes?: string;
  equipment?: string[];
  tags?: string[];
};

export type Video = {
  id: string;
  creator: Creator;
  playbackUrl: string;
  posterUrl: string;
  title: string;
  description: string;
  category: Category;
  /** Absent on videos built before content_type existed (mock data, some
   * client-side conversions) — always treat a missing value as "film",
   * never as "short"/"longform"; those are always explicitly tagged.
   * "film" is the default/standard library; "longform" is an explicit
   * creator choice for documentaries/extended cinematic pieces >= 3
   * minutes — see src/lib/validation/upload.ts for the duration rule. */
  contentType?: "film" | "short" | "longform";
  soundName?: string;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  durationSeconds: number;
  /** Real encoded dimensions — the single source of truth for aspect ratio,
   * classification, and player letterbox/pillarbox behavior. */
  width: number;
  height: number;
  badges?: Badge[];
  details?: VideoDetails;
  /** ISO timestamp — videos.created_at. Real "published time," unlike a
   * view count: there is no views_count anywhere this app actually
   * increments (videos.view_count exists in the schema but nothing writes
   * to it), so this app never displays a views stat rather than showing an
   * always-zero one. Optional, same as contentType/soundName/badges above —
   * absent for mock-data/test fixtures and any Video built before this
   * field existed, present for everything real video-fetch.ts returns. */
  createdAt?: string;
};

export type ShareLinkTTL = "1h" | "24h" | "7d";

export type ShareLink = {
  token: string;
  videoId: string;
  createdAt: number;
  expiresAt: number;
  revokedAt: number | null;
  viewCount: number;
};

export type ShareLinkStatus = "active" | "expired" | "revoked";

export type Collection = {
  id: string;
  title: string;
  description: string;
  coverUrl: string;
  videoIds: string[];
  /** Platform-curated, not creator-owned — collections table has no client
   * insert/update/delete grant at all. isFeatured/curator are only ever set
   * via direct SQL/service-role, same as invite codes. */
  isFeatured?: boolean;
  curatorId?: string;
  curatorName?: string;
};

/** A viewer-created (start_seconds, end_seconds) pointer into an existing
 * video's own playback asset — no new encoding, no new Stream asset.
 * Deliberately has no revenue/attribution field: this is a pure engagement/
 * discovery feature, not tied to any monetization machinery. */
export type Clip = {
  id: string;
  videoId: string;
  userId: string;
  creatorDisplayName: string;
  startSeconds: number;
  endSeconds: number;
  title?: string;
  createdAt: string;
};

/**
 * Architecture only — not built, not wired to any UI. Documented per the
 * Version 3 brief: "Design a Premiere system. NOT live streaming... Architecture
 * only. No fake backend." A Premiere is a scheduled reveal of an already-uploaded
 * VOD video, not a live broadcast — `videoId` always points at a normal `Video`
 * that plays back exactly as usual once `scheduledFor` has passed.
 */
export type Premiere = {
  id: string;
  videoId: string;
  creatorId: string;
  scheduledFor: number;
  /** Live chat is only meaningful during the countdown window; there is no
   * live video, only the release moment itself. */
  chatOpensAt: number;
  chatClosesAt: number;
  remindMeUserIds: string[];
};
