import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import "@testing-library/jest-dom/vitest";
import { ChannelVideoList } from "./ChannelVideoList";
import type { OwnVideo } from "@/lib/profile-videos";
import type { Video } from "@/lib/types";

const creator: Video["creator"] = {
  id: "c1",
  username: "milo_aerial",
  displayName: "Milo Aerial",
  avatarUrl: "",
  bannerUrl: "",
  bio: "",
  followers: 0,
  following: 0,
  totalViews: 0,
};

function makeReadyVideo(overrides: Partial<OwnVideo> = {}): OwnVideo {
  return {
    id: "v1",
    title: "Iceland, from 400ft",
    description: "A slow flight over the fjords.",
    category: "Travel",
    status: "ready",
    visibility: "public",
    posterUrl: "https://example.test/poster.jpg",
    width: 1920,
    height: 1080,
    likes: 4,
    comments: 1,
    shares: 0,
    saves: 2,
    createdAt: "2026-01-01T00:00:00.000Z", // well outside the 48h "recent" window
    ...overrides,
  };
}

describe("ChannelVideoList", () => {
  it("shows the empty-state CTA when there are no videos", () => {
    render(<ChannelVideoList videos={[]} creator={creator} />);
    expect(screen.getByText("Nothing uploaded yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Upload a Frame/ })).toHaveAttribute("href", "/upload");
  });

  it("renders a ready video as a single-column item with title, creator, views, and description", () => {
    const video = makeReadyVideo();
    render(<ChannelVideoList videos={[video]} creator={creator} />);
    const link = screen.getByRole("link", { name: "Watch Iceland, from 400ft" });
    expect(link).toHaveAttribute("href", `/watch/${video.id}`);
    expect(screen.getByText("Iceland, from 400ft")).toBeInTheDocument();
    expect(screen.getByText("Milo Aerial")).toBeInTheDocument();
    expect(screen.getByText("A slow flight over the fjords.")).toBeInTheDocument();
  });

  it("tags a video uploaded within the last 48 hours as UPLOAD, not an older one", () => {
    const recent = makeReadyVideo({ id: "v-recent", createdAt: new Date().toISOString() });
    const old = makeReadyVideo({ id: "v-old", createdAt: "2020-01-01T00:00:00.000Z" });
    render(<ChannelVideoList videos={[recent, old]} creator={creator} />);
    expect(screen.getAllByText("UPLOAD")).toHaveLength(1);
  });

  it("shows a processing card for a video that hasn't finished encoding, not a broken watch link", () => {
    const video = makeReadyVideo({ status: "processing", posterUrl: null });
    render(<ChannelVideoList videos={[video]} creator={creator} />);
    expect(screen.getByText("Processing…")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Watch/ })).not.toBeInTheDocument();
  });

  it("shows a failed card distinctly from a processing one", () => {
    const video = makeReadyVideo({ status: "failed", posterUrl: null });
    render(<ChannelVideoList videos={[video]} creator={creator} />);
    expect(screen.getByText("Failed to process")).toBeInTheDocument();
  });
});
