import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { ShortsFeed } from "./ShortsFeed";
import { usePlayerStore } from "@/store/player-store";
import type { Video } from "@/lib/types";

vi.mock("@/components/feed/ActionRail", () => ({ ActionRail: () => null }));
vi.mock("@/components/feed/CommentDrawer", () => ({ CommentDrawer: () => null }));
vi.mock("@/components/feed/VideoOptionsSheet", () => ({ VideoOptionsSheet: () => null }));
vi.mock("@/components/ui/Avatar", () => ({ Avatar: () => null }));
vi.mock("@/lib/cast", () => ({ useCastControl: () => ({ available: false, triggerCast: vi.fn() }) }));
vi.mock("@/lib/video-views", () => ({ recordVideoView: vi.fn() }));
const shorts = ["one", "two"].map((id) => ({
  id, title: id, playbackUrl: `/${id}.mp4`, posterUrl: `/${id}.jpg`,
  width: 1920, height: 1080, creator: { id: "creator", username: "creator", displayName: "Creator" },
})) as Video[];
let intersect: IntersectionObserverCallback;
beforeEach(() => {
  usePlayerStore.setState({ directorMode: false, isScrubbing: false, muted: true });
  vi.stubGlobal("IntersectionObserver", class {
    constructor(callback: IntersectionObserverCallback) { intersect = callback; }
    observe() {} disconnect() {}
  });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLMediaElement) {
    Object.defineProperty(this, "paused", { configurable: true, value: false });
    this.dispatchEvent(new Event("play"));
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (this: HTMLMediaElement) {
    Object.defineProperty(this, "paused", { configurable: true, value: true });
    this.dispatchEvent(new Event("pause"));
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function setup() {
  const view = render(<ShortsFeed shorts={shorts} />);
  const videos = view.container.querySelectorAll("video");
  videos.forEach((video) => {
    Object.defineProperty(video, "duration", { configurable: true, value: 120 });
    Object.defineProperty(video, "readyState", { configurable: true, value: 4 });
  });
  fireEvent.loadedMetadata(videos[0]);
  fireEvent.loadedData(videos[0]);
  return { ...view, videos };
}
it("pauses, seeks while paused, stays paused when mute changes, and resumes", () => {
  const { videos } = setup();
  expect(screen.queryByText("FRAMES")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Pause video" }));
  expect(videos[0].paused).toBe(true);
  expect(screen.getByText("FRAMES")).toHaveClass("text-white/15", "pointer-events-none");
  fireEvent.change(screen.getByRole("slider", { name: "Seek video" }), { target: { value: "75" } });
  expect(videos[0].currentTime).toBe(75);
  expect(videos[0].paused).toBe(true);
  expect(screen.getByRole("slider")).toHaveAttribute("aria-valuetext", "1:15 of 2:00");
  act(() => usePlayerStore.getState().toggleMuted());
  expect(videos[0].paused).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Play video" }));
  expect(videos[0].paused).toBe(false);
  expect(screen.queryByText("FRAMES")).not.toBeInTheDocument();
});
it("hides transport in Director Mode, reveals it on tap, and targets the active video", () => {
  const { container, videos } = setup();
  act(() => usePlayerStore.getState().enterDirectorMode());
  expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  expect(screen.getByRole("group", { hidden: true })).toHaveAttribute("inert");
  fireEvent.click(screen.getByRole("region"));
  expect(screen.getByRole("slider")).toBeInTheDocument();
  act(() => intersect([{ isIntersecting: true, target: container.querySelector('[data-index="1"]') }] as IntersectionObserverEntry[], {} as IntersectionObserver));
  fireEvent.change(screen.getByRole("slider"), { target: { value: "40" } });
  expect(videos[1].currentTime).toBe(40);
  expect(videos[0].currentTime).toBe(0);
  expect(videos[0].paused).toBe(true);
});
it("disables seeking until finite duration metadata arrives", () => {
  const { container } = render(<ShortsFeed shorts={shorts} />);
  expect(screen.getByRole("slider")).toBeDisabled();
  const video = container.querySelector("video")!;
  Object.defineProperty(video, "duration", { value: Infinity });
  fireEvent.loadedMetadata(video);
  expect(screen.getByRole("slider")).toBeDisabled();
});
