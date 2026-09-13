import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { Switch } from "./Switch";

// Regression coverage for turning "Sound on by default" (and any future
// use) into a real accessible switch, not a button with "On"/"Off" text.
describe("Switch", () => {
  it("exposes role=switch with the correct checked state", () => {
    render(<Switch checked={true} onChange={() => {}} label="Sound on by default" />);
    const el = screen.getByRole("switch", { name: "Sound on by default" });
    expect(el).toHaveAttribute("aria-checked", "true");
  });

  it("reflects aria-checked=false when unchecked", () => {
    render(<Switch checked={false} onChange={() => {}} label="Sound on by default" />);
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");
  });

  it("has an accessible name from the label prop, not relying on wrapping text", () => {
    render(<Switch checked={false} onChange={() => {}} label="Sound on by default" />);
    expect(screen.getByRole("switch", { name: "Sound on by default" })).toBeInTheDocument();
  });

  it("calls onChange with the flipped value on click", () => {
    const onChange = vi.fn();
    render(<Switch checked={false} onChange={onChange} label="Sound on by default" />);
    fireEvent.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("calls onChange with false when clicked while checked", () => {
    const onChange = vi.fn();
    render(<Switch checked={true} onChange={onChange} label="Sound on by default" />);
    fireEvent.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("is a real <button> — native Enter/Space activation comes for free from the browser, not custom key handling", () => {
    render(<Switch checked={false} onChange={() => {}} label="Sound on by default" />);
    expect(screen.getByRole("switch").tagName).toBe("BUTTON");
  });

  it("is focusable via keyboard and not disabled by default", () => {
    render(<Switch checked={false} onChange={() => {}} label="Sound on by default" />);
    const el = screen.getByRole("switch");
    el.focus();
    expect(el).toHaveFocus();
    expect(el).not.toBeDisabled();
  });

  it("respects the disabled prop", () => {
    render(<Switch checked={false} onChange={() => {}} label="Sound on by default" disabled />);
    expect(screen.getByRole("switch")).toBeDisabled();
  });
});
