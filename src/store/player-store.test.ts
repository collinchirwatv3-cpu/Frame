import { beforeEach, describe, expect, it } from "vitest";
import { usePlayerStore } from "./player-store";

beforeEach(() => {
  usePlayerStore.setState({ muted: true, activeId: null, directorMode: false, isScrubbing: false });
});

describe("player store — director mode", () => {
  it("toggles director mode on and off", () => {
    usePlayerStore.getState().toggleDirectorMode();
    expect(usePlayerStore.getState().directorMode).toBe(true);

    usePlayerStore.getState().toggleDirectorMode();
    expect(usePlayerStore.getState().directorMode).toBe(false);
  });

  it("exitDirectorMode forces it off regardless of current state", () => {
    usePlayerStore.setState({ directorMode: true });
    usePlayerStore.getState().exitDirectorMode();
    expect(usePlayerStore.getState().directorMode).toBe(false);
  });

  it("enterDirectorMode forces it on regardless of current state", () => {
    usePlayerStore.getState().enterDirectorMode();
    expect(usePlayerStore.getState().directorMode).toBe(true);

    usePlayerStore.getState().enterDirectorMode();
    expect(usePlayerStore.getState().directorMode).toBe(true);
  });

  it("does not affect mute state", () => {
    usePlayerStore.getState().toggleDirectorMode();
    expect(usePlayerStore.getState().muted).toBe(true);
  });
});

describe("player store — scrubbing", () => {
  it("setScrubbing sets isScrubbing explicitly", () => {
    usePlayerStore.getState().setScrubbing(true);
    expect(usePlayerStore.getState().isScrubbing).toBe(true);

    usePlayerStore.getState().setScrubbing(false);
    expect(usePlayerStore.getState().isScrubbing).toBe(false);
  });
});
