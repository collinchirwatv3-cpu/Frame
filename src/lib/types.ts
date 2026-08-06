export type Creator = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  bannerUrl: string;
  bio: string;
  website?: string;
  followers: number;
  following: number;
  totalViews: number;
  verified?: boolean;
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
   * never as "short"; shorts are always explicitly tagged. */
  contentType?: "film" | "short";
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
