import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import DiscoverPage from "./page";

// Regression coverage for the UI polish pass: Discover used to have no
// distinguishable loading/error state — a fetch failure and "genuinely no
// content yet" both fell into the same empty-looking screen. Now: a
// layout-stable skeleton while loading, a compact error state with Retry on
// failure, and the real empty state only once the fetch has actually
// resolved to nothing.
let shouldReject = false;

vi.mock("@/lib/video-fetch", () => ({
  fetchPublicVideos: async () => {
    if (shouldReject) throw new Error("network down");
    return [];
  },
  fetchFollowingVideos: async () => [],
  fetchSavedVideos: async () => [],
  fetchHistoryVideos: async () => [],
  fetchDiscoverVideos: async () => [],
  fetchCollections: async () => [],
}));

vi.mock("@/store/engagement-store", () => ({
  useEngagementStore: (selector: (s: { userId: string | null; hydrated: boolean }) => unknown) =>
    selector({ userId: null, hydrated: true }),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

beforeEach(() => {
  shouldReject = false;
});

describe("DiscoverPage loading/error/empty states", () => {
  it("shows a layout-stable skeleton while the initial fetch is in flight, not a generic spinner", () => {
    shouldReject = true; // never resolves synchronously either way; checking the immediate render
    const { container } = render(<DiscoverPage />);
    // The skeleton is built from Skeleton's own pulsing blocks — no
    // "No Frames yet" or error copy should be visible yet.
    expect(screen.queryByText(/no frames yet/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/couldn't load/i)).not.toBeInTheDocument();
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("shows a compact error state with Retry when the fetch fails, not the empty state", async () => {
    shouldReject = true;
    render(<DiscoverPage />);
    await screen.findByText(/couldn't load discover/i);
    expect(screen.queryByText(/no frames yet/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("never shows raw error details to the user", async () => {
    shouldReject = true;
    render(<DiscoverPage />);
    await screen.findByText(/couldn't load discover/i);
    expect(screen.queryByText(/network down/i)).not.toBeInTheDocument();
  });

  it("recovers via Retry once the underlying fetch succeeds", async () => {
    shouldReject = true;
    render(<DiscoverPage />);
    await screen.findByText(/couldn't load discover/i);

    shouldReject = false;
    screen.getByRole("button", { name: /retry/i }).click();

    await waitFor(() => expect(screen.getByText(/no frames yet/i)).toBeInTheDocument());
    expect(screen.queryByText(/couldn't load discover/i)).not.toBeInTheDocument();
  });
});
