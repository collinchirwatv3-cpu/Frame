// One-time seed: inserts the content from src/lib/mock-data.ts as real rows
// in the live Supabase project, using fixed UUIDs that mock-data.ts's `id`
// fields were updated to match. This lets the engagement/comments stores
// write against real foreign keys (likes/saves/follows/comments all
// reference real videos/profiles rows) without doing the full Milestone 2
// "swap mock-data reads for live queries" work yet — the UI still renders
// mock-data.ts, but the ids it renders now resolve to real DB rows.
//
// Run with: node --env-file=.env.local scripts/seed.mjs
// Safe to re-run: creators/videos/collections upsert on their fixed ids;
// comment seeding is skipped if any comments already exist for these videos.

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const avatar = (seed) => `https://picsum.photos/seed/${seed}/200/200`;
const banner = (seed) => `https://picsum.photos/seed/${seed}-banner/1600/500`;
const poster = (seed) => `https://picsum.photos/seed/${seed}/1600/900`;
// Was commondatastorage.googleapis.com/gtv-videos-bucket — that bucket's
// public access was revoked at some point after this was first seeded
// (confirmed live: every URL there now 403s, AccessDenied). Swapped to
// placeholdervideo.dev — generates a real video/mp4 at the exact
// resolution requested, explicit Access-Control-Allow-Origin: * — verified
// live before switching, not guessed.
const sampleMp4 = (width, height) => `https://placeholdervideo.dev/${width}x${height}`;

const CREATORS = [
  {
    id: "1901feaf-349b-435c-847a-b801b6a707ab",
    username: "milo_aerial",
    display_name: "Milo Ferreira",
    email: "milo.aerial@seed.frame.app",
    avatar_url: avatar("milo"),
    banner_url: banner("milo"),
    bio: "Drone pilot chasing golden hour across six continents.",
    website: "milo-aerial.com",
    followers_count: 482_000,
    following_count: 128,
    total_views: 19_400_000,
    verified: true,
    statement:
      "I shoot landscapes the way they felt standing there — not how a wide-angle lens usually flattens them. Every flight plan starts with light, not with the shot list.",
    equipment: ["DJI Inspire 3", "DJI Mavic 3 Cine", "24mm & 50mm primes"],
    available_for_hire: true,
  },
  {
    id: "23b673ac-f0a8-4124-94fc-07a7ad255600",
    username: "reddrift",
    display_name: "Reddrift Films",
    email: "reddrift@seed.frame.app",
    avatar_url: avatar("reddrift"),
    banner_url: banner("reddrift"),
    bio: "Car culture, shot on cinema glass.",
    followers_count: 221_000,
    following_count: 44,
    total_views: 8_100_000,
    verified: true,
  },
  {
    id: "ff4d26f5-179c-4d59-a60f-c3eccb2fdaa1",
    username: "auroraok",
    display_name: "Aurora Okafor",
    email: "auroraok@seed.frame.app",
    avatar_url: avatar("aurora"),
    banner_url: banner("aurora"),
    bio: "Documentary maker. Currently: West Africa coastlines.",
    followers_count: 96_500,
    following_count: 212,
    total_views: 2_900_000,
  },
  {
    id: "0ed62952-0271-463c-93d5-e3cc2a10d2c0",
    username: "nightpulse",
    display_name: "Nightpulse",
    email: "nightpulse@seed.frame.app",
    avatar_url: avatar("nightpulse"),
    banner_url: banner("nightpulse"),
    bio: "Live sets. Full sets, no cuts.",
    followers_count: 640_000,
    following_count: 12,
    total_views: 31_200_000,
    verified: true,
  },
];

const VIDEOS = [
  {
    id: "9b3a9560-47ab-4687-88d5-68fba532beb8",
    creator_id: CREATORS[0].id,
    playback_url: sampleMp4(1280, 720),
    poster_url: poster("v1"),
    title: "Iceland, from 400ft",
    description: "Three weeks chasing storms over the Ring Road. Shot on FPV + cine drone.",
    category: "Travel",
    sound_name: "Original audio · milo_aerial",
    duration_seconds: 34,
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
    likes_count: 128_400,
    comments_count: 2_310,
    shares_count: 4_820,
    saves_count: 9_140,
  },
  {
    id: "44ec8be3-32c6-4dec-a2bb-23f04121c4d4",
    creator_id: CREATORS[1].id,
    playback_url: sampleMp4(1280, 720),
    poster_url: poster("v2"),
    title: "Midnight run, Osaka",
    description: "RX-7 through wet Osaka streets. One take, no stabilization.",
    category: "Cars",
    sound_name: "Night Drive · Kessoku",
    duration_seconds: 41,
    width: 1280,
    height: 720,
    badges: ["Shot on Sony"],
    likes_count: 94_200,
    comments_count: 1_540,
    shares_count: 3_010,
    saves_count: 5_600,
  },
  {
    id: "6b3cf47e-0fdf-4614-a986-0219c8af0415",
    creator_id: CREATORS[2].id,
    playback_url: sampleMp4(1280, 720),
    poster_url: poster("v3"),
    title: "The last fishing villages",
    description: "Part 2 of the coastline series — Ghana's disappearing harbors.",
    category: "Documentaries",
    duration_seconds: 58,
    width: 1280,
    height: 720,
    badges: ["FRAMES Certified"],
    likes_count: 41_800,
    comments_count: 980,
    shares_count: 1_220,
    saves_count: 3_400,
  },
  {
    id: "76bfe705-bf8c-49d4-be62-63ea68ae1c11",
    creator_id: CREATORS[3].id,
    playback_url: sampleMp4(1280, 720),
    poster_url: poster("v4"),
    title: "Live from Warehouse 12",
    description: "Closing set, unedited. Full set on FRAMES first.",
    category: "Music",
    sound_name: "Live set · nightpulse",
    duration_seconds: 47,
    width: 1280,
    height: 720,
    badges: ["FRAMES Certified", "Spatial Audio"],
    likes_count: 212_900,
    comments_count: 5_400,
    shares_count: 11_200,
    saves_count: 18_700,
  },
  {
    id: "2e9abccc-82ff-477d-934f-d6388e5a4983",
    creator_id: CREATORS[0].id,
    playback_url: sampleMp4(1280, 720),
    poster_url: poster("v5"),
    title: "Above the fjords",
    description: "Norway leg of the aerial series, color graded on-site.",
    category: "Nature",
    duration_seconds: 29,
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
    likes_count: 76_300,
    comments_count: 1_120,
    shares_count: 2_050,
    saves_count: 6_800,
  },
];

// Discover's shorts — content_type: "short", portrait, no ratio banding,
// deliberately not cinematic (see supabase/migrations/20260806120000_shorts_content_type.sql).
const SHORTS = [
  {
    id: "b6b9b1a0-2f8e-4b0f-9d3c-7b6a1e2f9c01",
    creator_id: CREATORS[1].id,
    playback_url: sampleMp4(720, 1280),
    poster_url: poster("s1"),
    title: "POV: the tunnel run everyone's talking about",
    description: "No context needed.",
    category: "Cars",
    duration_seconds: 14,
    width: 720,
    height: 1280,
    likes_count: 18_200,
    comments_count: 340,
    shares_count: 2_100,
    saves_count: 610,
  },
  {
    id: "c7cae2b1-3f9f-4c1a-8e4d-8c7b2f3a0d12",
    creator_id: CREATORS[3].id,
    playback_url: sampleMp4(720, 1280),
    poster_url: poster("s2"),
    title: "3am soundcheck chaos",
    description: "This is why we're always late.",
    category: "Music",
    duration_seconds: 9,
    width: 720,
    height: 1280,
    likes_count: 44_900,
    comments_count: 1_020,
    shares_count: 5_400,
    saves_count: 1_800,
  },
  {
    id: "d8dbf3c2-4a0a-4d2b-9f5e-9d8c3a4b1e23",
    creator_id: CREATORS[2].id,
    playback_url: sampleMp4(720, 1280),
    poster_url: poster("s3"),
    title: "the coastline drone almost didn't make it back",
    description: "wind was NOT it today",
    category: "Nature",
    duration_seconds: 21,
    width: 720,
    height: 1280,
    likes_count: 9_600,
    comments_count: 210,
    shares_count: 480,
    saves_count: 320,
  },
];

const COLLECTIONS = [
  {
    id: "f9cf458e-feef-4b68-8361-f86c0a56effc",
    title: "Drone Masters",
    description: "The best aerial work on FRAMES — flown, not flown-over.",
    cover_url: poster("v5"),
    videoIds: [VIDEOS[0].id, VIDEOS[4].id],
  },
  {
    id: "f21943b6-9769-4f3c-8e0e-2e1cfcb10c86",
    title: "Night Drives",
    description: "Wet asphalt, neon, and cars that sound as good as they look.",
    cover_url: poster("v2"),
    videoIds: [VIDEOS[1].id],
  },
  {
    id: "c3ef8d04-ae1a-4bf5-9475-d8633d1ef2e8",
    title: "The Ocean",
    description: "Coastlines, harbors, and the people who depend on them.",
    cover_url: poster("v3"),
    videoIds: [VIDEOS[2].id],
  },
  {
    id: "677703cb-4680-4ecb-b2df-e19a8ef33e59",
    title: "Live Sets",
    description: "Full sets, no cuts, straight from the booth.",
    cover_url: poster("v4"),
    videoIds: [VIDEOS[3].id],
  },
];

const byUsername = Object.fromEntries(CREATORS.map((c) => [c.username, c]));

function agoToTimestamp(text) {
  const match = /^(\d+)([hd])$/.exec(text);
  if (!match) return new Date().toISOString();
  const [, n, unit] = match;
  const ms = unit === "h" ? Number(n) * 3_600_000 : Number(n) * 86_400_000;
  return new Date(Date.now() - ms).toISOString();
}

const COMMENTS = [
  { video_id: VIDEOS[0].id, author: "reddrift", text: "The color grade on this is insane", ago: "2h" },
  { video_id: VIDEOS[0].id, author: "auroraok", text: "Which drone did you fly this on?", ago: "1h" },
  { video_id: VIDEOS[1].id, author: "nightpulse", text: "One take?? no way", ago: "5h" },
  {
    video_id: VIDEOS[2].id,
    author: "milo_aerial",
    text: "Part 1 was already incredible, can't wait for the rest of the series",
    ago: "1d",
  },
  { video_id: VIDEOS[3].id, author: "reddrift", text: "Wish I was there for this set", ago: "3h" },
  { video_id: VIDEOS[3].id, author: "auroraok", text: "The energy in this room 🔥", ago: "2h" },
  { video_id: VIDEOS[4].id, author: "nightpulse", text: "4K60 really shows here, so smooth", ago: "6h" },
];

async function ensureCreatorAuthUser(creator) {
  const { error } = await supabase.auth.admin.createUser({
    id: creator.id,
    email: creator.email,
    email_confirm: true,
    user_metadata: { username: creator.username, display_name: creator.display_name },
  });
  if (error && !/already been registered|already exists/i.test(error.message)) {
    throw error;
  }
}

async function main() {
  console.log("Creating auth users + profiles for seed creators...");
  for (const creator of CREATORS) {
    await ensureCreatorAuthUser(creator);
    // handle_new_user() trigger already inserted a bare profile row from
    // user_metadata — fill in the rest of the fields mock-data.ts carries.
    const { error } = await supabase
      .from("profiles")
      .update({
        avatar_url: creator.avatar_url,
        banner_url: creator.banner_url,
        bio: creator.bio,
        website: creator.website ?? null,
        verified: !!creator.verified,
        statement: creator.statement ?? null,
        equipment: creator.equipment ?? null,
        available_for_hire: !!creator.available_for_hire,
        followers_count: creator.followers_count,
        following_count: creator.following_count,
        total_views: creator.total_views,
      })
      .eq("id", creator.id);
    if (error) throw error;
    console.log(`  profiles: ${creator.username}`);
  }

  console.log("Upserting videos...");
  const allVideos = [
    ...VIDEOS.map((v) => ({ ...v, content_type: "film" })),
    ...SHORTS.map((v) => ({ ...v, content_type: "short" })),
  ];
  const { error: videosError } = await supabase.from("videos").upsert(
    allVideos.map(({ id, creator_id, playback_url, poster_url, title, description, category, sound_name, duration_seconds, width, height, badges, details, likes_count, comments_count, shares_count, saves_count, content_type }) => ({
      id,
      creator_id,
      playback_url,
      poster_url,
      title,
      description,
      category,
      content_type,
      sound_name: sound_name ?? null,
      duration_seconds,
      width,
      height,
      visibility: "public",
      // Seeded rows represent complete, live videos — without this they'd
      // default to 'uploading' and videos_select_public's RLS (requires
      // processing_status = 'ready' for anyone but the creator) would hide
      // them from everyone.
      processing_status: "ready",
      badges: badges ?? [],
      details: details ?? null,
      likes_count,
      comments_count,
      shares_count,
      saves_count,
    })),
    { onConflict: "id" }
  );
  if (videosError) throw videosError;
  console.log(`  videos: ${VIDEOS.length} films, ${SHORTS.length} shorts`);

  console.log("Upserting collections...");
  const { error: collectionsError } = await supabase.from("collections").upsert(
    COLLECTIONS.map(({ id, title, description, cover_url }) => ({ id, title, description, cover_url })),
    { onConflict: "id" }
  );
  if (collectionsError) throw collectionsError;

  const collectionVideos = COLLECTIONS.flatMap((c) =>
    c.videoIds.map((video_id, position) => ({ collection_id: c.id, video_id, position }))
  );
  const { error: collectionVideosError } = await supabase
    .from("collection_videos")
    .upsert(collectionVideos, { onConflict: "collection_id,video_id" });
  if (collectionVideosError) throw collectionVideosError;
  console.log(`  collections: ${COLLECTIONS.length}`);

  console.log("Checking whether comments need seeding...");
  const { count, error: countError } = await supabase
    .from("comments")
    .select("id", { count: "exact", head: true })
    .in("video_id", VIDEOS.map((v) => v.id));
  if (countError) throw countError;

  if (count && count > 0) {
    console.log(`  skipped — ${count} comments already exist for seeded videos`);
  } else {
    const { error: commentsError } = await supabase.from("comments").insert(
      COMMENTS.map((c) => ({
        video_id: c.video_id,
        user_id: byUsername[c.author].id,
        text: c.text,
        created_at: agoToTimestamp(c.ago),
      }))
    );
    if (commentsError) throw commentsError;
    console.log(`  comments: ${COMMENTS.length}`);
  }

  console.log("Seed complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
