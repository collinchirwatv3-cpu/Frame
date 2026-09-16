import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { VideoOptionsSheet } from "./VideoOptionsSheet";
import { useCurrentUserStore } from "@/store/current-user-store";
import type { Video } from "@/lib/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

function makeVideo(creatorId: string): Video {
  return {
    id: "v1",
    creator: {
      id: creatorId,
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
}

beforeEach(() => {
  useCurrentUserStore.setState({ profile: null });
});

describe("VideoOptionsSheet", () => {
  it("does not show Edit/Delete for a video that isn't the signed-in user's own", () => {
    useCurrentUserStore.setState({ profile: { id: "someone-else" } as never });
    render(<VideoOptionsSheet video={makeVideo("creator-1")} open onClose={() => {}} />);
    expect(screen.queryByText("Edit Frame")).not.toBeInTheDocument();
    expect(screen.queryByText("Delete Frame")).not.toBeInTheDocument();
  });

  it("does not show Edit/Delete when signed out", () => {
    render(<VideoOptionsSheet video={makeVideo("creator-1")} open onClose={() => {}} />);
    expect(screen.queryByText("Edit Frame")).not.toBeInTheDocument();
    expect(screen.queryByText("Delete Frame")).not.toBeInTheDocument();
  });

  it("shows Edit/Delete for the video's own creator", () => {
    useCurrentUserStore.setState({ profile: { id: "creator-1" } as never });
    render(<VideoOptionsSheet video={makeVideo("creator-1")} open onClose={() => {}} />);
    expect(screen.getByText("Edit Frame")).toBeInTheDocument();
    expect(screen.getByText("Delete Frame")).toBeInTheDocument();
  });

  it("still shows the regular viewer options for everyone, owner or not", () => {
    useCurrentUserStore.setState({ profile: { id: "creator-1" } as never });
    render(<VideoOptionsSheet video={makeVideo("creator-1")} open onClose={() => {}} />);
    expect(screen.getByText("Watch together")).toBeInTheDocument();
    expect(screen.getByText("Report Frame")).toBeInTheDocument();
  });
});
