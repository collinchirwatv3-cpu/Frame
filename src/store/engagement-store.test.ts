import { beforeEach, describe, expect, it } from "vitest";
import { useEngagementStore } from "./engagement-store";

beforeEach(() => {
  useEngagementStore.setState({
    likedVideos: {},
    savedVideos: {},
    followedCreators: {},
    savedCollections: {},
  });
});

describe("engagement store", () => {
  it("toggles a video like on and off", () => {
    useEngagementStore.getState().toggleLike("v1");
    expect(useEngagementStore.getState().likedVideos.v1).toBe(true);

    useEngagementStore.getState().toggleLike("v1");
    expect(useEngagementStore.getState().likedVideos.v1).toBe(false);
  });

  it("tracks likes independently per video", () => {
    useEngagementStore.getState().toggleLike("v1");
    expect(useEngagementStore.getState().likedVideos.v2).toBeFalsy();
  });

  it("toggles follow state per creator", () => {
    useEngagementStore.getState().toggleFollow("c1");
    expect(useEngagementStore.getState().followedCreators.c1).toBe(true);
  });

  it("toggles save state per video", () => {
    useEngagementStore.getState().toggleSave("v1");
    expect(useEngagementStore.getState().savedVideos.v1).toBe(true);
  });

  it("toggles saved-collection state independently of video saves", () => {
    useEngagementStore.getState().toggleSavedCollection("col-drone-masters");
    expect(useEngagementStore.getState().savedCollections["col-drone-masters"]).toBe(true);
    expect(useEngagementStore.getState().savedVideos["col-drone-masters"]).toBeFalsy();

    useEngagementStore.getState().toggleSavedCollection("col-drone-masters");
    expect(useEngagementStore.getState().savedCollections["col-drone-masters"]).toBe(false);
  });
});
