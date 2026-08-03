import { describe, expect, it } from "vitest";
import { computeQualityScore } from "./quality";
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

describe("computeQualityScore", () => {
  it("stays within 0–100", () => {
    const score = computeQualityScore(makeVideo({ width: 3840, height: 2160, likes: 10_000_000 }));
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("scores higher resolution higher, all else equal", () => {
    const sd = computeQualityScore(makeVideo({ width: 640, height: 360 }));
    const hd = computeQualityScore(makeVideo({ width: 1920, height: 1080 }));
    const uhd = computeQualityScore(makeVideo({ width: 3840, height: 2160 }));
    expect(hd).toBeGreaterThan(sd);
    expect(uhd).toBeGreaterThan(hd);
  });

  it("rewards a supported aspect ratio over an unsupported one", () => {
    const supported = computeQualityScore(makeVideo({ width: 1920, height: 1080 })); // 16:9
    const unsupported = computeQualityScore(makeVideo({ width: 1000, height: 800 })); // no band
    expect(supported).toBeGreaterThan(unsupported);
  });

  it("rewards more editorial/equipment badges", () => {
    const noBadges = computeQualityScore(makeVideo({ badges: [] }));
    const withBadges = computeQualityScore(makeVideo({ badges: ["Drone", "Shot on RED"] }));
    expect(withBadges).toBeGreaterThan(noBadges);
  });

  it("rewards engagement relative to the creator's audience size", () => {
    const lowEngagement = computeQualityScore(
      makeVideo({ likes: 10, creator: { ...makeVideo().creator, followers: 1_000_000 } })
    );
    const highEngagement = computeQualityScore(
      makeVideo({ likes: 50_000, creator: { ...makeVideo().creator, followers: 100_000 } })
    );
    expect(highEngagement).toBeGreaterThan(lowEngagement);
  });
});
