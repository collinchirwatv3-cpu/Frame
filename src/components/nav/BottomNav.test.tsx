import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { BottomNav } from "./BottomNav";
import { usePlayerStore } from "@/store/player-store";

// Regression coverage for mobile nav clarity: the dock is icon-only for
// first-use identification of anything but the current destination — this
// checks that the ACTIVE destination specifically gets a visible text
// label (not just an aria-label, which was already there and isn't what
// was missing), while inactive destinations stay icon-only/compact.
let currentPathname = "/discover";
vi.mock("next/navigation", () => ({
  usePathname: () => currentPathname,
}));

describe("BottomNav active-destination label", () => {
  it("shows a visible text label next to the active destination's icon", () => {
    currentPathname = "/discover";
    render(<BottomNav />);
    // Every destination already has an aria-label (accessible even when
    // icon-only) — this specifically checks visible text content exists
    // for the active one.
    expect(screen.getByText("Discover")).toBeVisible();
  });

  it("does not show a visible text label for inactive destinations", () => {
    currentPathname = "/discover";
    render(<BottomNav />);
    expect(screen.queryByText("Search")).not.toBeInTheDocument();
    expect(screen.queryByText("Parties")).not.toBeInTheDocument();
    expect(screen.queryByText("Profile")).not.toBeInTheDocument();
    expect(screen.queryByText("Frames")).not.toBeInTheDocument();
  });

  it("every destination keeps an accessible name regardless of the visible label", () => {
    currentPathname = "/discover";
    render(<BottomNav />);
    expect(screen.getByRole("link", { name: "Frames" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Search" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Parties" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Profile" })).toBeInTheDocument();
  });

  it("switches the visible label to whichever destination is actually active", () => {
    currentPathname = "/parties";
    render(<BottomNav />);
    expect(screen.getByText("Parties")).toBeVisible();
    expect(screen.queryByText("Discover")).not.toBeInTheDocument();
  });

  it("fades out (director mode) without losing the underlying nav structure", () => {
    currentPathname = "/discover";
    usePlayerStore.setState({ directorMode: true });
    render(<BottomNav />);
    // Still renders (opacity-animated, not unmounted) — links stay in the DOM.
    expect(screen.getByRole("link", { name: "Discover" })).toBeInTheDocument();
    usePlayerStore.setState({ directorMode: false });
  });
});
