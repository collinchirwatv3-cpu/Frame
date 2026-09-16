import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { DeleteFrameDialog } from "./DeleteFrameDialog";
import type { Video } from "@/lib/types";

const pushSpy = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushSpy }),
}));

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
  vi.restoreAllMocks();
  pushSpy.mockClear();
});

describe("DeleteFrameDialog", () => {
  it("does nothing until the user confirms", () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    render(<DeleteFrameDialog video={video} open onClose={() => {}} />);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("cancel closes without calling the API", () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    const onClose = vi.fn();
    render(<DeleteFrameDialog video={video} open onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("confirming calls DELETE and navigates to /profile on success", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    render(<DeleteFrameDialog video={video} open onClose={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: /^delete frame$/i }));

    await waitFor(() => expect(pushSpy).toHaveBeenCalledWith("/profile"));
    expect(fetchSpy).toHaveBeenCalledWith("/api/videos/v1", expect.objectContaining({ method: "DELETE" }));
  });

  it("shows an error and does not navigate on failure", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: "Could not delete that Frame." }), { status: 400 }));
    render(<DeleteFrameDialog video={video} open onClose={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: /^delete frame$/i }));

    expect(await screen.findByText("Could not delete that Frame.")).toBeInTheDocument();
    expect(pushSpy).not.toHaveBeenCalled();
  });
});
