import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import SearchPage from "./page";

// Regression coverage: Search used to stay on a bare spinner forever if its
// request failed — no distinguishable error, no way to recover short of
// reloading the page.
let shouldReject = false;

vi.mock("@/lib/video-fetch", () => ({
  fetchPublicVideos: async () => {
    if (shouldReject) throw new Error("network down");
    return [];
  },
  fetchShorts: async () => [],
  fetchTopCreators: async () => [],
  fetchFeaturedCollections: async () => [],
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

beforeEach(() => {
  shouldReject = false;
});

describe("SearchPage loading/error states", () => {
  it("shows a layout-stable results skeleton while loading, not a bare spinner", () => {
    shouldReject = true;
    const { container } = render(<SearchPage />);
    expect(screen.queryByText(/nothing to search yet/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/couldn't load search/i)).not.toBeInTheDocument();
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("shows a compact error state with Retry instead of spinning forever when the request fails", async () => {
    shouldReject = true;
    render(<SearchPage />);
    await screen.findByText(/couldn't load search/i);
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("never shows raw error details to the user", async () => {
    shouldReject = true;
    render(<SearchPage />);
    await screen.findByText(/couldn't load search/i);
    expect(screen.queryByText(/network down/i)).not.toBeInTheDocument();
  });

  it("recovers via Retry once the underlying fetch succeeds", async () => {
    shouldReject = true;
    render(<SearchPage />);
    await screen.findByText(/couldn't load search/i);

    shouldReject = false;
    screen.getByRole("button", { name: /retry/i }).click();

    await waitFor(() => expect(screen.getByText(/nothing to search yet/i)).toBeInTheDocument());
    expect(screen.queryByText(/couldn't load search/i)).not.toBeInTheDocument();
  });
});
