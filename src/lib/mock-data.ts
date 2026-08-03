import type { Category, Collection, Creator, Video } from "./types";

const SAMPLE_MP4 = (name: string) =>
  `https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/${name}.mp4`;

const avatar = (seed: string) => `https://picsum.photos/seed/${seed}/200/200`;
const banner = (seed: string) => `https://picsum.photos/seed/${seed}-banner/1600/500`;
const poster = (seed: string) => `https://picsum.photos/seed/${seed}/1600/900`;

export const creators: Creator[] = [
  {
    id: "c1",
    username: "milo.aerial",
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
    id: "c2",
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
    id: "c3",
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
    id: "c4",
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

const cat = (c: Category) => c;

export const videos: Video[] = [
  {
    id: "v1",
    creator: creators[0],
    playbackUrl: SAMPLE_MP4("ForBiggerBlazes"),
    posterUrl: poster("v1"),
    title: "Iceland, from 400ft",
    description: "Three weeks chasing storms over the Ring Road. Shot on FPV + cine drone.",
    category: cat("Travel"),
    soundName: "Original audio · milo.aerial",
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
    id: "v2",
    creator: creators[1],
    playbackUrl: SAMPLE_MP4("ForBiggerJoyrides"),
    posterUrl: poster("v2"),
    title: "Midnight run, Osaka",
    description: "RX-7 through wet Osaka streets. One take, no stabilization.",
    category: cat("Cars"),
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
    id: "v3",
    creator: creators[2],
    playbackUrl: SAMPLE_MP4("ForBiggerEscapes"),
    posterUrl: poster("v3"),
    title: "The last fishing villages",
    description: "Part 2 of the coastline series — Ghana's disappearing harbors.",
    category: cat("Documentaries"),
    likes: 41_800,
    comments: 980,
    shares: 1_220,
    saves: 3_400,
    durationSeconds: 58,
    width: 1280,
    height: 720,
    badges: ["FRAME Certified"],
  },
  {
    id: "v4",
    creator: creators[3],
    playbackUrl: SAMPLE_MP4("ForBiggerFun"),
    posterUrl: poster("v4"),
    title: "Live from Warehouse 12",
    description: "Closing set, unedited. Full set on FRAME first.",
    category: cat("Music"),
    soundName: "Live set · nightpulse",
    likes: 212_900,
    comments: 5_400,
    shares: 11_200,
    saves: 18_700,
    durationSeconds: 47,
    width: 1280,
    height: 720,
    badges: ["FRAME Certified", "Spatial Audio"],
  },
  {
    id: "v5",
    creator: creators[0],
    playbackUrl: SAMPLE_MP4("ForBiggerMeltdowns"),
    posterUrl: poster("v5"),
    title: "Above the fjords",
    description: "Norway leg of the aerial series, color graded on-site.",
    category: cat("Nature"),
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

export const currentUser: Creator = creators[0];

// Grounded in content that actually exists — every collection has at least one
// real matching video, rather than an invented theme with nothing behind it.
export const collections: Collection[] = [
  {
    id: "col-drone-masters",
    title: "Drone Masters",
    description: "The best aerial work on FRAME — flown, not flown-over.",
    coverUrl: poster("v5"),
    videoIds: ["v1", "v5"],
  },
  {
    id: "col-night-drives",
    title: "Night Drives",
    description: "Wet asphalt, neon, and cars that sound as good as they look.",
    coverUrl: poster("v2"),
    videoIds: ["v2"],
  },
  {
    id: "col-the-ocean",
    title: "The Ocean",
    description: "Coastlines, harbors, and the people who depend on them.",
    coverUrl: poster("v3"),
    videoIds: ["v3"],
  },
  {
    id: "col-live-sets",
    title: "Live Sets",
    description: "Full sets, no cuts, straight from the booth.",
    coverUrl: poster("v4"),
    videoIds: ["v4"],
  },
];

// Private videos never appear in `videos` — not in the feed, Explore, or the
// public profile grid. The only way to reach one is a share link generated
// from the Private tab on the owner's own profile.
export const privateVideos: Video[] = [
  {
    id: "p1",
    creator: currentUser,
    playbackUrl: SAMPLE_MP4("ForBiggerEscapes"),
    posterUrl: poster("p1"),
    title: "Iceland — client rough cut",
    description: "Unfinished grade, for client review only. Don't post yet.",
    category: cat("Travel"),
    likes: 0,
    comments: 0,
    shares: 0,
    saves: 0,
    durationSeconds: 51,
    width: 1280,
    height: 720,
  },
  {
    id: "p2",
    creator: currentUser,
    playbackUrl: SAMPLE_MP4("Sintel"),
    posterUrl: poster("p2"),
    title: "Norway B-roll dump",
    description: "Raw selects from the fjords shoot — sharing with the edit team.",
    category: cat("Nature"),
    likes: 0,
    comments: 0,
    shares: 0,
    saves: 0,
    durationSeconds: 38,
    width: 1280,
    height: 720,
  },
];

export type DMThread = {
  id: string;
  creator: Creator;
  lastMessage: string;
  timestamp: string;
  unread: boolean;
};

export const dmThreads: DMThread[] = [
  {
    id: "t1",
    creator: creators[1],
    lastMessage: "Sent you the RAW files for the Osaka edit",
    timestamp: "2m",
    unread: true,
  },
  {
    id: "t2",
    creator: creators[3],
    lastMessage: "Set was 🔥, let's collab on the next one",
    timestamp: "1h",
    unread: true,
  },
  {
    id: "t3",
    creator: creators[2],
    lastMessage: "Thanks for the feedback on the cut!",
    timestamp: "1d",
    unread: false,
  },
];

export type MockComment = {
  id: string;
  author: string;
  avatarUrl: string;
  text: string;
  timestamp: string;
};

export const mockComments: Record<string, MockComment[]> = {
  v1: [
    {
      id: "v1-c1",
      author: "reddrift",
      avatarUrl: avatar("reddrift"),
      text: "The color grade on this is insane",
      timestamp: "2h",
    },
    {
      id: "v1-c2",
      author: "auroraok",
      avatarUrl: avatar("aurora"),
      text: "Which drone did you fly this on?",
      timestamp: "1h",
    },
  ],
  v2: [
    {
      id: "v2-c1",
      author: "nightpulse",
      avatarUrl: avatar("nightpulse"),
      text: "One take?? no way",
      timestamp: "5h",
    },
  ],
  v3: [
    {
      id: "v3-c1",
      author: "milo.aerial",
      avatarUrl: avatar("milo"),
      text: "Part 1 was already incredible, can't wait for the rest of the series",
      timestamp: "1d",
    },
  ],
  v4: [
    {
      id: "v4-c1",
      author: "reddrift",
      avatarUrl: avatar("reddrift"),
      text: "Wish I was there for this set",
      timestamp: "3h",
    },
    {
      id: "v4-c2",
      author: "auroraok",
      avatarUrl: avatar("aurora"),
      text: "The energy in this room 🔥",
      timestamp: "2h",
    },
  ],
  v5: [
    {
      id: "v5-c1",
      author: "nightpulse",
      avatarUrl: avatar("nightpulse"),
      text: "4K60 really shows here, so smooth",
      timestamp: "6h",
    },
  ],
};

export const notificationSummary = [
  { id: "likes", label: "Likes", count: 214 },
  { id: "comments", label: "Comments", count: 38 },
  { id: "followers", label: "Followers", count: 12 },
  { id: "mentions", label: "Mentions", count: 3 },
  { id: "system", label: "System", count: 1 },
];
