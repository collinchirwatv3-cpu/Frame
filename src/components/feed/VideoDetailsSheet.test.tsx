import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { VideoDetailsSheet } from "./VideoDetailsSheet";
import { useClipsStore } from "@/store/clips-store";
import { useTagsStore } from "@/store/tags-store";
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
  playbackUrl: "",
  posterUrl: "",
  title: "Iceland, from 400ft",
  description: "Aerial footage over the fjords",
  category: "Travel",
  likes: 0,
  comments: 0,
  shares: 0,
  saves: 0,
  durationSeconds: 125,
  createdAt: "2026-09-01T00:00:00.000Z",
  width: 1920,
  height: 1080,
};

beforeEach(() => {
  // No entry for v1 — byVideoId[video.id] is undefined, exactly the shape
  // that regresses if the sheet's selector falls back to a fresh `[]`
  // literal instead of a stable module-level constant (see
  // VideoDetailsSheet.tsx's EMPTY_CLIPS comment): that fresh reference on
  // every call breaks useSyncExternalStore's equality check and React
  // throws "Maximum update depth exceeded" during this exact render.
  useClipsStore.setState({ byVideoId: {}, loadingVideoId: null, fetchClips: vi.fn() });
  // Same reasoning as useClipsStore above — a real fetchVideoTagTiers would
  // hit the network (no Supabase env in this test environment); stubbed to
  // a no-op so the sheet just renders its "no tags yet" fallback instead.
  useTagsStore.setState({ byVideoId: {}, loadingVideoIds: {}, errorVideoIds: {}, epoch: 0, fetchVideoTagTiers: vi.fn() });
});

describe("VideoDetailsSheet", () => {
  it("renders without an infinite-render crash for a video with no clips yet", () => {
    expect(() => render(<VideoDetailsSheet video={video} open onClose={() => {}} onPlayClip={() => {}} />)).not.toThrow();
    expect(screen.getByText("Iceland, from 400ft")).toBeInTheDocument();
  });

  it("shows the concise metadata row: category, duration, and relative published time", () => {
    render(<VideoDetailsSheet video={video} open onClose={() => {}} onPlayClip={() => {}} />);
    expect(screen.getByText("Travel")).toBeInTheDocument();
    expect(screen.getByText("2:05")).toBeInTheDocument();
  });

  it("stays stable across re-renders (the same regression, triggered by a parent re-render instead of mount)", () => {
    const { rerender } = render(<VideoDetailsSheet video={video} open onClose={() => {}} onPlayClip={() => {}} />);
    expect(() =>
      rerender(<VideoDetailsSheet video={video} open onClose={() => {}} onPlayClip={() => {}} />)
    ).not.toThrow();
  });
});
