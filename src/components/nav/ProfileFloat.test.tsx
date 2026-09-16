import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import "@testing-library/jest-dom/vitest";
import { ProfileFloat } from "./ProfileFloat";

// Regression coverage for the iPad-landscape report: this used to stay
// pinned in the top-right corner in ANY landscape orientation (not just
// short-height rotated phones), crowding the action rail's own column —
// see the component's own doc comment. jsdom can't actually evaluate a
// real orientation media query, so this asserts the Tailwind class that
// drives it is present rather than a rendered visual outcome.
describe("ProfileFloat", () => {
  it("carries landscape:hidden so it gets out of the action rail's way in landscape", () => {
    render(<ProfileFloat />);
    expect(screen.getByRole("link")).toBeInTheDocument();
    expect(screen.getByRole("link").parentElement).toHaveClass("landscape:hidden");
  });
});
