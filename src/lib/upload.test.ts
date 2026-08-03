import { describe, expect, it } from "vitest";
import { deriveTitleFromFilename, mostUsedCategory } from "./upload";
import type { Video } from "./types";

describe("deriveTitleFromFilename", () => {
  it("strips the extension and title-cases dash/underscore-separated words", () => {
    expect(deriveTitleFromFilename("iceland-storm_take3.mov")).toBe("Iceland Storm Take3");
  });

  it("handles a plain filename with no separators", () => {
    expect(deriveTitleFromFilename("DJI_0042.MP4")).toBe("DJI 0042");
  });

  it("returns an empty string for a name that's only an extension", () => {
    expect(deriveTitleFromFilename(".mp4")).toBe("");
  });
});

function makeVideo(category: Video["category"]): Video {
  return {
    id: "x",
    creator: {} as Video["creator"],
    playbackUrl: "",
    posterUrl: "",
    title: "",
    description: "",
    category,
    likes: 0,
    comments: 0,
    shares: 0,
    saves: 0,
    durationSeconds: 0,
    width: 1920,
    height: 1080,
  };
}

describe("mostUsedCategory", () => {
  it("returns the fallback when the creator has no prior videos", () => {
    expect(mostUsedCategory([], "Travel")).toBe("Travel");
  });

  it("returns the most frequent category among the creator's videos", () => {
    const creatorVideos = [makeVideo("Nature"), makeVideo("Nature"), makeVideo("Travel")];
    expect(mostUsedCategory(creatorVideos, "Cars")).toBe("Nature");
  });
});
