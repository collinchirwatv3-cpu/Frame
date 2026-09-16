import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { EditFrameSheet } from "./EditFrameSheet";
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
  title: "Original title",
  description: "Original description",
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
  vi.restoreAllMocks();
});

describe("EditFrameSheet", () => {
  it("pre-fills the current title/description", () => {
    render(<EditFrameSheet video={video} open onClose={() => {}} />);
    expect(screen.getByDisplayValue("Original title")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Original description")).toBeInTheDocument();
  });

  it("blocks saving an empty title without calling the API", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    render(<EditFrameSheet video={video} open onClose={() => {}} />);
    fireEvent.change(screen.getByDisplayValue("Original title"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    expect(await screen.findByText("Title is required.")).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("PATCHes the video and closes on success", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ title: "New title", description: "New desc" }), { status: 200 }));
    const onClose = vi.fn();
    const onSaved = vi.fn();
    render(<EditFrameSheet video={video} open onClose={onClose} onSaved={onSaved} />);

    fireEvent.change(screen.getByDisplayValue("Original title"), { target: { value: "New title" } });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/videos/v1",
      expect.objectContaining({ method: "PATCH" })
    );
    expect(onSaved).toHaveBeenCalledWith({ title: "New title", description: "New desc" });
  });

  it("shows the server's error message and does not close on failure", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Title is too long" }), { status: 400 })
    );
    const onClose = vi.fn();
    render(<EditFrameSheet video={video} open onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    expect(await screen.findByText("Title is too long")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
