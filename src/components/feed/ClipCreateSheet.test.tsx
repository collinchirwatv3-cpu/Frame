import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { ClipCreateSheet } from "./ClipCreateSheet";
import { useClipsStore } from "@/store/clips-store";
import type { Video } from "@/lib/types";

const video: Video = {
  id: "v1",
  creator: {
    id: "c1",
    username: "milo_aerial",
    displayName: "Milo",
    avatarUrl: "",
    bannerUrl: "",
    bio: "",
    followers: 0,
    following: 0,
    totalViews: 0,
  },
  playbackUrl: "https://videodelivery.example/v1/manifest.mp4",
  posterUrl: "https://videodelivery.example/v1/thumb.jpg",
  title: "Iceland, from 400ft",
  description: "",
  category: "Travel",
  likes: 0,
  comments: 0,
  shares: 0,
  saves: 0,
  durationSeconds: 100,
  createdAt: "2026-09-01T00:00:00.000Z",
  width: 1920,
  height: 1080,
};

beforeEach(() => {
  useClipsStore.setState({ createClip: vi.fn().mockResolvedValue(true) });
});

// The track's drag math reads getBoundingClientRect() to convert a
// pointer's clientX into a 0-1 fraction — jsdom returns an all-zero rect
// by default, which would divide by zero, so every test needs a real
// width/left to compute against.
function mockTrackRect() {
  Element.prototype.getBoundingClientRect = vi.fn(() => ({
    left: 0,
    width: 200,
    top: 0,
    height: 32,
    right: 200,
    bottom: 32,
    x: 0,
    y: 0,
    toJSON: () => {},
  }));
  // jsdom doesn't implement the Pointer Capture API at all — a real
  // browser has it, jsdom just throws "not a function" without this stub.
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
}

describe("ClipCreateSheet scrubber", () => {
  beforeEach(() => {
    mockTrackRect();
  });

  it("renders a preview video with the video's playback/poster URLs", () => {
    render(<ClipCreateSheet video={video} open onClose={() => {}} />);
    const el = screen.getByRole("dialog").querySelector("video") as HTMLVideoElement;
    expect(el).toBeInTheDocument();
    expect(el.src).toBe(video.playbackUrl);
    expect(el.poster).toBe(video.posterUrl);
  });

  it("seeks the preview to the clip start once metadata loads", () => {
    render(<ClipCreateSheet video={video} open onClose={() => {}} />);
    const el = screen.getByRole("dialog").querySelector("video") as HTMLVideoElement;
    fireEvent.loadedMetadata(el);
    // Default end fraction is 15s/100s = 0.15, start is 0 — the initial seek.
    expect(el.currentTime).toBe(0);
  });

  it("dragging the track scrubs the playhead and seeks the preview, clamped inside the trim range", () => {
    render(<ClipCreateSheet video={video} open onClose={() => {}} />);
    const el = screen.getByRole("dialog").querySelector("video") as HTMLVideoElement;
    const track = screen.getByRole("slider", { name: "Clip start" }).parentElement as HTMLElement;

    // Track is 200px wide representing the full 100s duration; clicking at
    // x=10 is fraction 0.05 -> 5s, which is inside the default [0, 15s]
    // trim range, so it should land exactly there.
    fireEvent.pointerDown(track, { clientX: 10, buttons: 1 });
    expect(el.currentTime).toBe(5);

    // x=190 -> fraction 0.95 -> 95s, which is outside the default [0, 15s]
    // range and must clamp to the end handle's position (15s), not jump
    // past the selected clip.
    fireEvent.pointerDown(track, { clientX: 190, buttons: 1 });
    expect(el.currentTime).toBe(15);
  });

  it("dragging the start handle also updates the preview to that new boundary", () => {
    render(<ClipCreateSheet video={video} open onClose={() => {}} />);
    const el = screen.getByRole("dialog").querySelector("video") as HTMLVideoElement;
    const startHandle = screen.getByRole("slider", { name: "Clip start" });

    fireEvent.pointerDown(startHandle, { clientX: 0, buttons: 1 });
    fireEvent.pointerMove(startHandle, { clientX: 20, buttons: 1 });

    expect(startHandle).toHaveAttribute("aria-valuenow", "10");
    expect(el.currentTime).toBe(10);
  });

  it("dragging the end handle also updates the preview to that new boundary", () => {
    render(<ClipCreateSheet video={video} open onClose={() => {}} />);
    const el = screen.getByRole("dialog").querySelector("video") as HTMLVideoElement;
    const endHandle = screen.getByRole("slider", { name: "Clip end" });

    fireEvent.pointerDown(endHandle, { clientX: 0, buttons: 1 });
    fireEvent.pointerMove(endHandle, { clientX: 60, buttons: 1 });

    expect(endHandle).toHaveAttribute("aria-valuenow", "30");
    expect(el.currentTime).toBe(30);
  });
});
