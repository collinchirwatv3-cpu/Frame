import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { VideoCard } from "./VideoCard";
import { useTagsStore } from "@/store/tags-store";
import { useCommentsStore } from "@/store/comments-store";
import type { Video } from "@/lib/types";

// jsdom doesn't implement real media playback.
HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
HTMLMediaElement.prototype.pause = vi.fn();

// Deliberately NOT mocking ActionRail/VideoOverlay/Avatar — this is
// exactly the regression test for the duplicate-avatar bug (both used to
// render the creator's avatar independently). Only the heavier/irrelevant
// sheets and browser-API-touching hooks are stubbed.
vi.mock("@/components/feed/CommentDrawer", () => ({ CommentDrawer: () => null }));
vi.mock("@/components/feed/VideoOptionsSheet", () => ({ VideoOptionsSheet: () => null }));
vi.mock("@/components/feed/VideoDetailsSheet", () => ({ VideoDetailsSheet: () => null }));
vi.mock("@/components/feed/ClipCreateSheet", () => ({ ClipCreateSheet: () => null }));
vi.mock("@/lib/cast", () => ({ useCastControl: () => ({ available: false, triggerCast: vi.fn() }) }));
vi.mock("@/lib/video-views", () => ({ recordVideoView: vi.fn() }));

const video: Video = {
  id: "v1",
  creator: {
    id: "c1",
    username: "milo_aerial",
    displayName: "Milo Aerial",
    avatarUrl: "https://example.test/avatar.jpg",
    bannerUrl: "",
    bio: "",
    followers: 0,
    following: 0,
    totalViews: 0,
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
  durationSeconds: 125,
  createdAt: "2026-09-01T00:00:00.000Z",
  width: 1920,
  height: 1080,
};

beforeEach(() => {
  useTagsStore.setState({ byVideoId: {}, loadingVideoIds: {}, errorVideoIds: {}, epoch: 0, fetchVideoTagTiers: vi.fn() });
  useCommentsStore.setState({ byVideoId: {}, fetchComments: vi.fn() });
});

describe("VideoCard", () => {
  it("shows the creator's avatar exactly once, not once in the caption and again in the action rail", () => {
    render(<VideoCard video={video} active index={0} sectionRef={() => {}} showSearchButton={false} />);
    expect(screen.getAllByAltText("Milo Aerial")).toHaveLength(1);
  });

  it("hides the search button in landscape so the action rail gets that corner's room — the iPad report", () => {
    render(<VideoCard video={video} active index={0} sectionRef={() => {}} showSearchButton />);
    expect(screen.getByLabelText("Search").parentElement).toHaveClass("landscape:hidden");
  });
});
