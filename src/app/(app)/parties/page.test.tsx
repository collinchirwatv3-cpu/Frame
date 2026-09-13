import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import PartiesPage from "./page";

// Regression coverage: Parties used to render a blank content area while
// loading (isEmpty was computed off arrays that hadn't been fetched yet, so
// every PartySection returned null with nothing else shown) and had no
// error handling at all — a failed fetch left `loading` stuck `true` forever.
let shouldReject = false;

vi.mock("@/lib/watch-parties", () => ({
  fetchParties: async () => {
    if (shouldReject) throw new Error("network down");
    return [];
  },
  fetchMyParties: async () => [],
  fetchFollowedParties: async () => [],
}));

vi.mock("@/store/current-user-store", () => ({
  useCurrentUserStore: (selector: (s: { profile: null }) => unknown) => selector({ profile: null }),
}));

// CreatePartySheet (rendered unconditionally, closed) needs a router context.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

beforeEach(() => {
  shouldReject = false;
});

describe("PartiesPage loading/error states", () => {
  it("shows a layout-stable skeleton while loading, not a blank content area", () => {
    shouldReject = true;
    const { container } = render(<PartiesPage />);
    expect(screen.queryByText(/no parties yet/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/couldn't load parties/i)).not.toBeInTheDocument();
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("shows a compact error state with Retry when the fetch fails, not a blank area", async () => {
    shouldReject = true;
    render(<PartiesPage />);
    await screen.findByText(/couldn't load parties/i);
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("never shows raw error details to the user", async () => {
    shouldReject = true;
    render(<PartiesPage />);
    await screen.findByText(/couldn't load parties/i);
    expect(screen.queryByText(/network down/i)).not.toBeInTheDocument();
  });

  it("recovers via Retry once the underlying fetch succeeds", async () => {
    shouldReject = true;
    render(<PartiesPage />);
    await screen.findByText(/couldn't load parties/i);

    shouldReject = false;
    screen.getByRole("button", { name: /retry/i }).click();

    await waitFor(() => expect(screen.getByText(/no parties yet/i)).toBeInTheDocument());
    expect(screen.queryByText(/couldn't load parties/i)).not.toBeInTheDocument();
  });
});
