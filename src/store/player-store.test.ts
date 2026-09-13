import { beforeEach, describe, expect, it } from "vitest";
import { usePlayerStore } from "./player-store";

beforeEach(() => {
  usePlayerStore.setState({
    muted: true,
    activeId: null,
    directorMode: false,
    isScrubbing: false,
    showDirectorModeHint: false,
  });
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

// Regression coverage for the Director Mode first-use hint: it's meant to
// disappear the moment its own promise ("a tap brings chrome back") is
// fulfilled, which must hold however the exit actually happens — the tap
// handler's toggleDirectorMode, or the feed unmounting via exitDirectorMode.
describe("player store — director mode hint", () => {
  it("toggleDirectorMode clears the hint when it turns director mode off", () => {
    usePlayerStore.setState({ directorMode: true, showDirectorModeHint: true });
    usePlayerStore.getState().toggleDirectorMode();
    expect(usePlayerStore.getState().directorMode).toBe(false);
    expect(usePlayerStore.getState().showDirectorModeHint).toBe(false);
  });

  it("toggleDirectorMode does not touch the hint when it turns director mode on", () => {
    usePlayerStore.setState({ directorMode: false, showDirectorModeHint: false });
    usePlayerStore.getState().toggleDirectorMode();
    expect(usePlayerStore.getState().directorMode).toBe(true);
    expect(usePlayerStore.getState().showDirectorModeHint).toBe(false);
  });

  it("exitDirectorMode always clears the hint", () => {
    usePlayerStore.setState({ directorMode: true, showDirectorModeHint: true });
    usePlayerStore.getState().exitDirectorMode();
    expect(usePlayerStore.getState().showDirectorModeHint).toBe(false);
  });

  it("enterDirectorMode does not clear an already-showing hint", () => {
    usePlayerStore.setState({ showDirectorModeHint: true });
    usePlayerStore.getState().enterDirectorMode();
    expect(usePlayerStore.getState().showDirectorModeHint).toBe(true);
  });

  it("setShowDirectorModeHint sets the flag explicitly", () => {
    usePlayerStore.getState().setShowDirectorModeHint(true);
    expect(usePlayerStore.getState().showDirectorModeHint).toBe(true);
    usePlayerStore.getState().setShowDirectorModeHint(false);
    expect(usePlayerStore.getState().showDirectorModeHint).toBe(false);
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
