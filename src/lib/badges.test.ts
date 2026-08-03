import { describe, expect, it } from "vitest";
import { computeBadges } from "./badges";
import type { Video } from "./types";

function makeVideo(overrides: Partial<Video> = {}): Video {
  return {
    id: "v1",
    creator: {
      id: "c1",
      username: "creator",
      displayName: "Creator",
      avatarUrl: "",
      bannerUrl: "",
      bio: "",
      followers: 100_000,
      following: 1,
      totalViews: 1,
    },
    playbackUrl: "",
    posterUrl: "",
    title: "Test",
    description: "",
    category: "Travel",
    likes: 1_000,
    comments: 0,
    shares: 0,
    saves: 0,
    durationSeconds: 30,
    width: 1280,
    height: 720,
    ...overrides,
  };
}

describe("computeBadges", () => {
  it("never asserts 21:9 Cinema on a video that isn't actually that wide", () => {
    const badges = computeBadges(makeVideo({ width: 1280, height: 720 }));
    expect(badges).not.toContain("21:9 Cinema");
  });

  it("adds 21:9 Cinema when the real encode is genuinely that wide", () => {
    const badges = computeBadges(makeVideo({ width: 3440, height: 1440 }));
    expect(badges).toContain("21:9 Cinema");
  });

  it("preserves a manually-authored FRAME Certified badge regardless of score", () => {
    const badges = computeBadges(makeVideo({ badges: ["FRAME Certified"], likes: 1 }));
    expect(badges).toContain("FRAME Certified");
  });

  it("grants FRAME Certified purely from the Quality Index when it's earned, not just authored", () => {
    const highScoring = makeVideo({
      width: 3840,
      height: 2160,
      badges: ["Drone", "Shot on RED"],
      likes: 500_000,
      creator: { ...makeVideo().creator, followers: 100_000 },
    });
    expect(computeBadges(highScoring)).toContain("FRAME Certified");
  });

  it("does not certify a video with no strong signal", () => {
    const lowScoring = makeVideo({
      width: 640,
      height: 480,
      badges: [],
      likes: 1,
      creator: { ...makeVideo().creator, followers: 1_000_000 },
    });
    expect(computeBadges(lowScoring)).not.toContain("FRAME Certified");
  });
});
