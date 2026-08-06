import { describe, expect, it } from "vitest";
import { matchesCollectionQuery, matchesVideoQuery } from "./search";
import type { Collection, Video } from "./types";

function makeVideo(overrides: Partial<Video> = {}): Video {
  return {
    id: "v1",
    creator: {
      id: "c1",
      username: "milo.aerial",
      displayName: "Milo Ferreira",
      avatarUrl: "",
      bannerUrl: "",
      bio: "",
      followers: 1000,
      following: 1,
      totalViews: 1,
    },
    playbackUrl: "",
    posterUrl: "",
    title: "Iceland, from 400ft",
    description: "",
    category: "Travel",
    likes: 0,
    comments: 0,
    shares: 0,
    saves: 0,
    durationSeconds: 30,
    width: 1920,
    height: 1080,
    ...overrides,
  };
}

describe("matchesVideoQuery", () => {
  it("matches an empty query against anything", () => {
    expect(matchesVideoQuery(makeVideo(), "")).toBe(true);
  });

  it("matches on title", () => {
    expect(matchesVideoQuery(makeVideo(), "iceland")).toBe(true);
  });

  it("matches on creator username", () => {
    expect(matchesVideoQuery(makeVideo(), "milo.aerial")).toBe(true);
  });

  it("matches on category", () => {
    expect(matchesVideoQuery(makeVideo(), "travel")).toBe(true);
  });

  it("matches on camera/lens/location from details", () => {
    const video = makeVideo({
      details: { camera: "DJI Inspire 3", location: "Ring Road, Iceland" },
    });
    expect(matchesVideoQuery(video, "dji inspire")).toBe(true);
    expect(matchesVideoQuery(video, "ring road")).toBe(true);
  });

  it("matches on tags and badges", () => {
    const video = makeVideo({ details: { tags: ["storms"] }, badges: ["Drone"] });
    expect(matchesVideoQuery(video, "storms")).toBe(true);
    expect(matchesVideoQuery(video, "drone")).toBe(true);
  });

  it("does not match unrelated text", () => {
    expect(matchesVideoQuery(makeVideo(), "underwater basket weaving")).toBe(false);
  });
});

describe("matchesCollectionQuery", () => {
  const collection: Collection = {
    id: "col-1",
    title: "Drone Masters",
    description: "The best aerial work on FRAMES.",
    coverUrl: "",
    videoIds: [],
  };

  it("matches an empty query", () => {
    expect(matchesCollectionQuery(collection, "")).toBe(true);
  });

  it("matches on title", () => {
    expect(matchesCollectionQuery(collection, "drone")).toBe(true);
  });

  it("matches on description", () => {
    expect(matchesCollectionQuery(collection, "aerial")).toBe(true);
  });

  it("does not match unrelated text", () => {
    expect(matchesCollectionQuery(collection, "underwater")).toBe(false);
  });
});
