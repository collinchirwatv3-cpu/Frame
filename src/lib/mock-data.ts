import type { Category, Collection, Creator, Video } from "./types";

// TEMPORARY DEMO CONTENT — reinstated for a live product demo, not a
// permanent reversion. This mirrors scripts/seed.mjs exactly (same UUIDs,
// same content) so the same rows exist for real in Supabase — likes/saves/
// comments/follows written against these ids hit real foreign keys, not
// dead ones. Remove both this content and the picsum.photos/
// commondatastorage.googleapis.com allowances in next.config.ts and
// security-headers.ts before real alpha launch; real creators replace this
// once they exist. See the "no mock data" note this file used to carry —
// that principle still holds, this is a deliberate, temporary exception.
const avatar = (seed: string) => `https://picsum.photos/seed/${seed}/200/200`;
const banner = (seed: string) => `https://picsum.photos/seed/${seed}-banner/1600/500`;
const poster = (seed: string) => `https://picsum.photos/seed/${seed}/1600/900`;
const sampleMp4 = (name: string) =>
  `https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/${name}.mp4`;

export const creators: Creator[] = [
  {
    id: "1901feaf-349b-435c-847a-b801b6a707ab",
    username: "milo_aerial",
    displayName: "Milo Ferreira",
    avatarUrl: avatar("milo"),
    bannerUrl: banner("milo"),
    bio: "Drone pilot chasing golden hour across six continents.",
    website: "milo-aerial.com",
    followers: 482_000,
    following: 128,
    totalViews: 19_400_000,
    verified: true,
    statement:
      "I shoot landscapes the way they felt standing there — not how a wide-angle lens usually flattens them. Every flight plan starts with light, not with the shot list.",
    equipment: ["DJI Inspire 3", "DJI Mavic 3 Cine", "24mm & 50mm primes"],
    availableForHire: true,
  },
  {
    id: "23b673ac-f0a8-4124-94fc-07a7ad255600",
    username: "reddrift",
    displayName: "Reddrift Films",
    avatarUrl: avatar("reddrift"),
    bannerUrl: banner("reddrift"),
    bio: "Car culture, shot on cinema glass.",
    followers: 221_000,
    following: 44,
    totalViews: 8_100_000,
    verified: true,
  },
  {
    id: "ff4d26f5-179c-4d59-a60f-c3eccb2fdaa1",
    username: "auroraok",
    displayName: "Aurora Okafor",
    avatarUrl: avatar("aurora"),
    bannerUrl: banner("aurora"),
    bio: "Documentary maker. Currently: West Africa coastlines.",
    followers: 96_500,
    following: 212,
    totalViews: 2_900_000,
  },
  {
    id: "0ed62952-0271-463c-93d5-e3cc2a10d2c0",
    username: "nightpulse",
    displayName: "Nightpulse",
    avatarUrl: avatar("nightpulse"),
    bannerUrl: banner("nightpulse"),
    bio: "Live sets. Full sets, no cuts.",
    followers: 640_000,
    following: 12,
    totalViews: 31_200_000,
    verified: true,
  },
];

export const videos: Video[] = [
  {
    id: "9b3a9560-47ab-4687-88d5-68fba532beb8",
    creator: creators[0],
    playbackUrl: sampleMp4("ForBiggerBlazes"),
    posterUrl: poster("v1"),
    title: "Iceland, from 400ft",
    description: "Three weeks chasing storms over the Ring Road. Shot on FPV + cine drone.",
    category: "Travel",
    soundName: "Original audio · milo_aerial",
    likes: 128_400,
    comments: 2_310,
    shares: 4_820,
    saves: 9_140,
    durationSeconds: 34,
    width: 1280,
    height: 720,
    badges: ["Drone"],
    details: {
      camera: "DJI Inspire 3",
      lens: "24mm prime",
      fps: 60,
      codec: "ProRes 422 HQ",
      location: "Ring Road, Iceland",
      creatorNotes: "Waited four days for this cloud layer. Worth it.",
      equipment: ["DJI Inspire 3", "ND16 filter"],
      tags: ["Iceland", "storms", "aerial"],
    },
  },
  {
    id: "44ec8be3-32c6-4dec-a2bb-23f04121c4d4",
    creator: creators[1],
    playbackUrl: sampleMp4("ForBiggerJoyrides"),
    posterUrl: poster("v2"),
    title: "Midnight run, Osaka",
    description: "RX-7 through wet Osaka streets. One take, no stabilization.",
    category: "Cars",
    soundName: "Night Drive · Kessoku",
    likes: 94_200,
    comments: 1_540,
    shares: 3_010,
    saves: 5_600,
    durationSeconds: 41,
    width: 1280,
    height: 720,
    badges: ["Shot on Sony"],
  },
  {
    id: "6b3cf47e-0fdf-4614-a986-0219c8af0415",
    creator: creators[2],
    playbackUrl: sampleMp4("ForBiggerEscapes"),
    posterUrl: poster("v3"),
    title: "The last fishing villages",
    description: "Part 2 of the coastline series — Ghana's disappearing harbors.",
    category: "Documentaries",
    likes: 41_800,
    comments: 980,
    shares: 1_220,
    saves: 3_400,
    durationSeconds: 58,
    width: 1280,
    height: 720,
    badges: ["FRAMES Certified"],
  },
  {
    id: "76bfe705-bf8c-49d4-be62-63ea68ae1c11",
    creator: creators[3],
    playbackUrl: sampleMp4("ForBiggerFun"),
    posterUrl: poster("v4"),
    title: "Live from Warehouse 12",
    description: "Closing set, unedited. Full set on FRAMES first.",
    category: "Music",
    soundName: "Live set · nightpulse",
    likes: 212_900,
    comments: 5_400,
    shares: 11_200,
    saves: 18_700,
    durationSeconds: 47,
    width: 1280,
    height: 720,
    badges: ["FRAMES Certified", "Spatial Audio"],
  },
  {
    id: "2e9abccc-82ff-477d-934f-d6388e5a4983",
    creator: creators[0],
    playbackUrl: sampleMp4("ForBiggerMeltdowns"),
    posterUrl: poster("v5"),
    title: "Above the fjords",
    description: "Norway leg of the aerial series, color graded on-site.",
    category: "Nature",
    likes: 76_300,
    comments: 1_120,
    shares: 2_050,
    saves: 6_800,
    durationSeconds: 29,
    width: 1280,
    height: 720,
    badges: ["Drone"],
    details: {
      camera: "DJI Mavic 3 Cine",
      lens: "24mm equiv.",
      fps: 60,
      location: "Lysefjord, Norway",
      behindTheScenes: "Flown in −4°C — batteries only lasted 6 minutes per flight.",
      tags: ["Norway", "fjords", "aerial"],
    },
  },
];

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

// Grounded in content that actually exists — every collection has at least
// one real matching video, rather than an invented theme with nothing
// behind it.
export const collections: Collection[] = [
  {
    id: "f9cf458e-feef-4b68-8361-f86c0a56effc",
    title: "Drone Masters",
    description: "The best aerial work on FRAMES — flown, not flown-over.",
    coverUrl: poster("v5"),
    videoIds: [videos[0].id, videos[4].id],
  },
  {
    id: "f21943b6-9769-4f3c-8e0e-2e1cfcb10c86",
    title: "Night Drives",
    description: "Wet asphalt, neon, and cars that sound as good as they look.",
    coverUrl: poster("v2"),
    videoIds: [videos[1].id],
  },
  {
    id: "c3ef8d04-ae1a-4bf5-9475-d8633d1ef2e8",
    title: "The Ocean",
    description: "Coastlines, harbors, and the people who depend on them.",
    coverUrl: poster("v3"),
    videoIds: [videos[2].id],
  },
  {
    id: "677703cb-4680-4ecb-b2df-e19a8ef33e59",
    title: "Live Sets",
    description: "Full sets, no cuts, straight from the booth.",
    coverUrl: poster("v4"),
    videoIds: [videos[3].id],
  },
];

// Private videos never appear in `videos` — not in the feed, Explore, or the
// public profile grid. The owner's own Profile page reads real Supabase
// data for its own Private tab (see fetchOwnVideos in lib/profile-videos.ts)
// and never touches this array — it's only here for the /s/[token] share-
// link demo path, and stays empty since no fake share token exists to reach it.
export const privateVideos: Video[] = [];

export type DMThread = {
  id: string;
  creator: Creator;
  lastMessage: string;
  timestamp: string;
  unread: boolean;
};

export const dmThreads: DMThread[] = [
  {
    id: "dm-1",
    creator: creators[1],
    lastMessage: "That grade on the Iceland piece is insane, who colored it?",
    timestamp: "2h",
    unread: true,
  },
  {
    id: "dm-2",
    creator: creators[3],
    lastMessage: "Sent over the multitrack for the Warehouse 12 set",
    timestamp: "1d",
    unread: false,
  },
];

export const notificationSummary = [
  { id: "likes", label: "Likes", count: 12 },
  { id: "comments", label: "Comments", count: 4 },
  { id: "followers", label: "Followers", count: 3 },
  { id: "mentions", label: "Mentions", count: 0 },
  { id: "system", label: "System", count: 1 },
];
