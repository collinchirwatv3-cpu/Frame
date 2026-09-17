import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { VideoCard } from "@/components/feed/VideoCard";
import { ShortsFeed } from "./ShortsFeed";
import { usePlayerStore } from "@/store/player-store";
import { useCurrentUserStore } from "@/store/current-user-store";
import type { Video } from "@/lib/types";

vi.mock("@/components/feed/ActionRail", () => ({ ActionRail: () => null }));
vi.mock("@/components/feed/CommentDrawer", () => ({ CommentDrawer: () => null }));
vi.mock("@/components/feed/VideoOptionsSheet", () => ({ VideoOptionsSheet: () => null }));
vi.mock("@/components/ui/Avatar", () => ({ Avatar: () => null }));
vi.mock("@/lib/cast", () => ({ useCastControl: () => ({ available: false, triggerCast: vi.fn() }) }));
vi.mock("@/lib/video-views", () => ({ recordVideoView: vi.fn() }));
vi.mock("@/components/feed/VideoOverlay", () => ({ VideoOverlay: () => null }));
vi.mock("@/components/feed/VideoDetailsSheet", () => ({ VideoDetailsSheet: () => null }));
vi.mock("@/components/feed/ClipCreateSheet", () => ({ ClipCreateSheet: () => null }));
const shorts = ["one", "two"].map((id) => ({
  id, title: id, playbackUrl: `/${id}.mp4`, posterUrl: `/${id}.jpg`,
  width: 1920, height: 1080, creator: { id: "creator", username: "creator", displayName: "Creator" },
})) as Video[];
let intersect: IntersectionObserverCallback;
beforeEach(() => {
  usePlayerStore.setState({ directorMode: false, isScrubbing: false, muted: true });
  useCurrentUserStore.setState({ profile: null });
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
  expect(document.querySelector('[data-paused-watermark="true"]')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Pause video" }));
  expect(videos[0].paused).toBe(true);
  expect(document.querySelector('[data-paused-watermark="true"]')).toHaveClass("pointer-events-none");
  fireEvent.change(screen.getByRole("slider", { name: "Seek video" }), { target: { value: "75" } });
  expect(videos[0].currentTime).toBe(75);
  expect(videos[0].paused).toBe(true);
  expect(screen.getByRole("slider")).toHaveAttribute("aria-valuetext", "1:15 of 2:00");
  act(() => usePlayerStore.getState().toggleMuted());
  expect(videos[0].paused).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Play video" }));
  expect(videos[0].paused).toBe(false);
  expect(document.querySelector('[data-paused-watermark="true"]')).not.toBeInTheDocument();
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

it("video taps pause and resume while controls do not toggle playback", () => {
  const { videos } = setup();
  act(() => usePlayerStore.getState().enterDirectorMode());
  fireEvent.click(videos[0]);
  expect(videos[0].paused).toBe(true);
  expect(document.querySelector('[data-paused-watermark="true"]')).toBeInTheDocument();
  expect(usePlayerStore.getState().directorMode).toBe(false);
  fireEvent.click(screen.getByRole("slider"));
  expect(videos[0].paused).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Unmute" }));
  expect(videos[0].paused).toBe(true);
  fireEvent.click(videos[0]);
  expect(videos[0].paused).toBe(false);
  expect(document.querySelector('[data-paused-watermark="true"]')).not.toBeInTheDocument();
});

it("Discover uses the same transport, pause watermark, and paused seeking", () => {
  const { container } = render(<VideoCard video={shorts[0]} active index={0} sectionRef={() => {}} showSearchButton={false} />);
  const video = container.querySelector("video")!;
  Object.defineProperty(video, "duration", { configurable: true, value: 120 });
  fireEvent.loadedMetadata(video);
  fireEvent.click(video);
  expect(video.paused).toBe(true);
  expect(document.querySelector('[data-paused-watermark="true"]')).toBeInTheDocument();
  fireEvent.change(screen.getByRole("slider"), { target: { value: "60" } });
  expect(video.currentTime).toBe(60);
  act(() => usePlayerStore.getState().toggleMuted());
  expect(video.paused).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Play video" }));
  expect(video.paused).toBe(false);
});
it("transport keyboard events do not trigger feed shortcuts", () => {
  setup();
  const listener = vi.fn();
  window.addEventListener("keydown", listener);
  fireEvent.keyDown(screen.getByRole("button", { name: "Pause video" }), { key: " " });
  expect(listener).not.toHaveBeenCalled();
  window.removeEventListener("keydown", listener);
});

it("hides the Follow pill on your own short — the database rejects self-follow anyway", () => {
  useCurrentUserStore.setState({ profile: { id: "creator" } as never }); // same id as shorts[*].creator.id
  setup();
  expect(screen.queryByLabelText(/^Follow @/)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/^Unfollow @/)).not.toBeInTheDocument();
});

it("still shows the Follow pill on someone else's short", () => {
  useCurrentUserStore.setState({ profile: { id: "someone-else" } as never });
  setup();
  expect(screen.getByLabelText("Follow @creator")).toBeInTheDocument();
});

it("seeds a trimmed short at its trim start and loops it within bounds instead of the whole file", () => {
  const trimmedShorts = [{ ...shorts[0], trimStartSeconds: 10, trimEndSeconds: 50 }, shorts[1]];
  const { container } = render(<ShortsFeed shorts={trimmedShorts} />);
  const video = container.querySelector("video")!;
  Object.defineProperty(video, "duration", { configurable: true, value: 120 });
  Object.defineProperty(video, "readyState", { configurable: true, value: 4 });
  fireEvent.loadedMetadata(video);
  expect(video.loop).toBe(false);
  expect(video.currentTime).toBe(10);
  video.currentTime = 50;
  fireEvent.timeUpdate(video);
  expect(video.currentTime).toBe(10);
});
