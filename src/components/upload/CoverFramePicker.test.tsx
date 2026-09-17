import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { CoverFramePicker } from "./CoverFramePicker";

const compositeThumbnailSpy = vi.fn(async (video: HTMLVideoElement, options: unknown) => {
  void video;
  void options;
  return new Blob(["fake"], { type: "image/jpeg" });
});
vi.mock("@/lib/thumbnail-canvas", () => ({
  compositeThumbnail: (video: HTMLVideoElement, options: unknown) => compositeThumbnailSpy(video, options),
}));

function stubTrackRect() {
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
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
}

function setup(overrides: Partial<React.ComponentProps<typeof CoverFramePicker>> = {}) {
  const videoEl = document.createElement("video");
  const videoRef = { current: videoEl };
  const onTimeChange = vi.fn();
  const onTextEnabledChange = vi.fn();
  const onTextChange = vi.fn();
  const onCapture = vi.fn();
  const view = render(
    <CoverFramePicker
      videoRef={videoRef}
      trimStart={0}
      trimEnd={100}
      time={50}
      onTimeChange={onTimeChange}
      textEnabled={false}
      onTextEnabledChange={onTextEnabledChange}
      text=""
      onTextChange={onTextChange}
      textPos={{ xPct: 0.5, yPct: 0.82 }}
      onCapture={onCapture}
      {...overrides}
    />
  );
  return { ...view, videoEl, onTimeChange, onTextEnabledChange, onTextChange, onCapture };
}

beforeEach(() => {
  compositeThumbnailSpy.mockClear();
});

describe("CoverFramePicker", () => {
  it("shows the current position bounded to the trim window", () => {
    setup({ trimStart: 10, trimEnd: 60, time: 30 });
    expect(screen.getByRole("slider", { name: "Cover frame position" })).toHaveAttribute("aria-valuenow", "30");
    expect(screen.getByText("0:10")).toBeInTheDocument();
    expect(screen.getByText("1:00")).toBeInTheDocument();
  });

  it("clamps a time outside the trim window into range for display", () => {
    setup({ trimStart: 10, trimEnd: 60, time: 5 });
    expect(screen.getByRole("slider", { name: "Cover frame position" })).toHaveAttribute("aria-valuenow", "10");
  });

  it("dragging the position track seeks the shared preview video and reports the new time", () => {
    stubTrackRect();
    const { videoEl, onTimeChange } = setup({ trimStart: 0, trimEnd: 100, time: 50 });
    const track = screen.getByRole("slider", { name: "Cover frame position" }).parentElement as HTMLElement;
    fireEvent.pointerDown(track, { clientX: 30, buttons: 1 });
    expect(onTimeChange).toHaveBeenCalledWith(30);
    expect(videoEl.currentTime).toBe(30);
  });

  it("captures the current frame via compositeThumbnail and reports the blob", async () => {
    const { onCapture } = setup();
    fireEvent.click(screen.getByRole("button", { name: /capture cover/i }));
    await vi.waitFor(() => expect(onCapture).toHaveBeenCalled());
    expect(compositeThumbnailSpy).toHaveBeenCalledWith(expect.any(HTMLVideoElement), { text: undefined });
    expect(onCapture.mock.calls[0][0]).toBeInstanceOf(Blob);
  });

  it("shows a captured-frame confirmation swatch after capturing", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /capture cover/i }));
    await screen.findByAltText("Captured cover frame");
    expect(screen.getByText("This frame will be your cover.")).toBeInTheDocument();
  });

  it("passes the text overlay through to compositeThumbnail when enabled with real text", async () => {
    setup({ textEnabled: true, text: "Iceland Trip", textPos: { xPct: 0.4, yPct: 0.7 } });
    fireEvent.click(screen.getByRole("button", { name: /capture cover/i }));
    await vi.waitFor(() => expect(compositeThumbnailSpy).toHaveBeenCalled());
    expect(compositeThumbnailSpy).toHaveBeenCalledWith(
      expect.any(HTMLVideoElement),
      { text: { text: "Iceland Trip", xPct: 0.4, yPct: 0.7, fontSizePct: 0.09 } }
    );
  });

  it("omits the text overlay when enabled but empty", async () => {
    setup({ textEnabled: true, text: "   " });
    fireEvent.click(screen.getByRole("button", { name: /capture cover/i }));
    await vi.waitFor(() => expect(compositeThumbnailSpy).toHaveBeenCalled());
    expect(compositeThumbnailSpy).toHaveBeenCalledWith(expect.any(HTMLVideoElement), { text: undefined });
  });

  it("toggling Add text calls back up rather than managing its own enabled state", () => {
    const { onTextEnabledChange } = setup({ textEnabled: false });
    fireEvent.click(screen.getByRole("button", { name: "Add text" }));
    expect(onTextEnabledChange).toHaveBeenCalledWith(true);
  });

  it("shows the text input only once enabled, and forwards edits", () => {
    const { onTextChange, rerender } = setup({ textEnabled: false });
    expect(screen.queryByPlaceholderText("Title card text")).not.toBeInTheDocument();
    rerender(
      <CoverFramePicker
        videoRef={{ current: document.createElement("video") }}
        trimStart={0}
        trimEnd={100}
        time={50}
        onTimeChange={vi.fn()}
        textEnabled
        onTextEnabledChange={vi.fn()}
        text=""
        onTextChange={onTextChange}
        textPos={{ xPct: 0.5, yPct: 0.82 }}
        onCapture={vi.fn()}
      />
    );
    fireEvent.change(screen.getByPlaceholderText("Title card text"), { target: { value: "Hi" } });
    expect(onTextChange).toHaveBeenCalledWith("Hi");
  });
});
