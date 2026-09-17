import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { VideoTrimmer } from "./VideoTrimmer";

function stubTrackRect() {
  // jsdom never lays anything out — every drag handler divides by the
  // track's own getBoundingClientRect().width, same workaround
  // ClipCreateSheet's own tests need for its structurally identical track.
  Element.prototype.getBoundingClientRect = vi.fn(() => ({
    left: 0,
    width: 100,
    right: 100,
    top: 0,
    bottom: 0,
    height: 0,
    x: 0,
    y: 0,
    toJSON: () => {},
  }));
  // jsdom doesn't implement the Pointer Capture API at all.
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
}

describe("VideoTrimmer", () => {
  it("shows the IN/selected-duration/OUT readout and duration", () => {
    const { container } = render(<VideoTrimmer durationSeconds={60} start={0} end={60} onChange={vi.fn()} />);
    expect(screen.getByText("1:00 selected")).toBeInTheDocument();
    expect(container.textContent).toMatch(/IN\s*0:00/);
    expect(container.textContent).toMatch(/OUT\s*1:00/);
    expect(screen.getByRole("slider", { name: "Trim start" })).toHaveAttribute("aria-valuenow", "0");
    expect(screen.getByRole("slider", { name: "Trim end" })).toHaveAttribute("aria-valuenow", "60");
  });

  it("shows ruler tick labels scaled to the video's duration", () => {
    render(<VideoTrimmer durationSeconds={1200} start={0} end={1200} onChange={vi.fn()} />);
    // pickTicks(1200) -> [0, 300, 600, 900] -> 0:00, 5:00, 10:00, 15:00
    expect(screen.getByText("5:00")).toBeInTheDocument();
    expect(screen.getByText("10:00")).toBeInTheDocument();
    expect(screen.getByText("15:00")).toBeInTheDocument();
  });

  it("dragging the start handle moves it but never past the end handle's minimum gap", () => {
    stubTrackRect();
    const onChange = vi.fn();
    render(<VideoTrimmer durationSeconds={100} start={0} end={100} onChange={onChange} />);
    const startHandle = screen.getByRole("slider", { name: "Trim start" });
    fireEvent.pointerDown(startHandle, { pointerId: 1 });
    fireEvent.pointerMove(startHandle, { clientX: 40, buttons: 1 });
    expect(onChange).toHaveBeenCalledWith(40, 100);
  });

  it("dragging the end handle moves it but never before the start handle's minimum gap", () => {
    stubTrackRect();
    const onChange = vi.fn();
    render(<VideoTrimmer durationSeconds={100} start={0} end={100} onChange={onChange} />);
    const endHandle = screen.getByRole("slider", { name: "Trim end" });
    fireEvent.pointerDown(endHandle, { pointerId: 1 });
    fireEvent.pointerMove(endHandle, { clientX: 30, buttons: 1 });
    expect(onChange).toHaveBeenCalledWith(0, 30);
  });

  it("calls onScrub with the dragged handle's new position, for a caller to seek a preview video", () => {
    stubTrackRect();
    const onScrub = vi.fn();
    render(<VideoTrimmer durationSeconds={100} start={0} end={100} onChange={vi.fn()} onScrub={onScrub} />);
    const startHandle = screen.getByRole("slider", { name: "Trim start" });
    fireEvent.pointerDown(startHandle, { pointerId: 1 });
    fireEvent.pointerMove(startHandle, { clientX: 20, buttons: 1 });
    expect(onScrub).toHaveBeenCalledWith(20);
  });
});
