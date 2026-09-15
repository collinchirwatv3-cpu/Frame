import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import "@testing-library/jest-dom/vitest";
import { CollapsibleTagSection } from "./CollapsibleTagSection";

describe("CollapsibleTagSection", () => {
  it("hides children until expanded, by default", () => {
    render(
      <CollapsibleTagSection title="Mood" summary="Optional">
        <div>Mood picker contents</div>
      </CollapsibleTagSection>
    );
    expect(screen.queryByText("Mood picker contents")).not.toBeInTheDocument();
    expect(screen.getByText("Optional")).toBeInTheDocument();
  });

  it("shows children immediately when defaultOpen is set", () => {
    render(
      <CollapsibleTagSection title="Mood" summary="Optional" defaultOpen>
        <div>Mood picker contents</div>
      </CollapsibleTagSection>
    );
    expect(screen.getByText("Mood picker contents")).toBeInTheDocument();
  });

  it("toggles open and closed on click", () => {
    render(
      <CollapsibleTagSection title="Gear" summary="2 selected">
        <div>Gear picker contents</div>
      </CollapsibleTagSection>
    );
    const toggle = screen.getByRole("button", { name: /Gear/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Gear picker contents")).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Gear picker contents")).not.toBeInTheDocument();
  });
});
