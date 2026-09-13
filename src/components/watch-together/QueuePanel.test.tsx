import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { QueuePanel } from "./QueuePanel";
import type { QueueItem } from "@/lib/use-watch-room";
import type { Video } from "@/lib/types";

const NOW_PLAYING: Video = {
  id: "v1",
  creator: {
    id: "c1",
    username: "milo_aerial",
    displayName: "Milo",
    avatarUrl: "",
    bannerUrl: "",
    bio: "",
    followers: 0,
    following: 0,
    totalViews: 0,
  },
  playbackUrl: "",
  posterUrl: "https://example.com/now-playing.jpg",
  title: "Iceland, from 400ft",
  description: "",
  category: "Travel",
  likes: 0,
  comments: 0,
  shares: 0,
  saves: 0,
  durationSeconds: 125,
  width: 1920,
  height: 1080,
};

const QUEUE_ITEM: QueueItem = {
  id: "v2",
  title: "The last fishing villages",
  posterUrl: "https://example.com/queued.jpg",
  creatorUsername: "auroraok",
  durationSeconds: 90,
};

describe("QueuePanel", () => {
  it("shows the current Frame in a clear Now playing state, with its real thumbnail and duration", () => {
    render(<QueuePanel nowPlaying={NOW_PLAYING} queue={[]} onMove={vi.fn()} onRemove={vi.fn()} onAdd={vi.fn()} />);
    expect(screen.getByText("Iceland, from 400ft")).toBeInTheDocument();
    expect(screen.getByText("Now playing")).toBeInTheDocument();
    expect(screen.getByText("2:05")).toBeInTheDocument();
  });

  it("shows a dedicated empty state with its own Add Frames action when the queue is empty", () => {
    const onAdd = vi.fn();
    render(<QueuePanel nowPlaying={NOW_PLAYING} queue={[]} onMove={vi.fn()} onRemove={vi.fn()} onAdd={onAdd} />);
    expect(screen.getByText("Your queue is empty")).toBeInTheDocument();
    // Two "Add Frames" affordances exist by design (the header link stays
    // available even when non-empty) — both must actually work.
    const addButtons = screen.getAllByText("Add Frames");
    expect(addButtons.length).toBeGreaterThanOrEqual(2);
    addButtons.forEach((btn) => fireEvent.click(btn));
    expect(onAdd).toHaveBeenCalled();
  });

  it("shows each queued Frame's thumbnail, title, creator, and duration when available", () => {
    render(
      <QueuePanel nowPlaying={NOW_PLAYING} queue={[QUEUE_ITEM]} onMove={vi.fn()} onRemove={vi.fn()} onAdd={vi.fn()} />
    );
    expect(screen.getByText("The last fishing villages")).toBeInTheDocument();
    expect(screen.getByText("@auroraok")).toBeInTheDocument();
    expect(screen.getByText("1:30")).toBeInTheDocument();
  });

  it("omits the duration readout for a queued item with no duration data (older broadcast payload)", () => {
    const withoutDuration: QueueItem = {
      id: QUEUE_ITEM.id,
      title: QUEUE_ITEM.title,
      posterUrl: QUEUE_ITEM.posterUrl,
      creatorUsername: QUEUE_ITEM.creatorUsername,
    };
    render(
      <QueuePanel
        nowPlaying={NOW_PLAYING}
        queue={[withoutDuration]}
        onMove={vi.fn()}
        onRemove={vi.fn()}
        onAdd={vi.fn()}
      />
    );
    expect(screen.getByText("The last fishing villages")).toBeInTheDocument();
    expect(screen.queryByText("1:30")).not.toBeInTheDocument();
  });

  it("keeps reorder/remove open to every caller — no host gate here (the queue is deliberately collaborative)", () => {
    const onMove = vi.fn();
    const onRemove = vi.fn();
    const secondItem = { ...QUEUE_ITEM, id: "v3", title: "Above the fjords" };
    render(
      <QueuePanel
        nowPlaying={NOW_PLAYING}
        queue={[QUEUE_ITEM, secondItem]}
        onMove={onMove}
        onRemove={onRemove}
        onAdd={vi.fn()}
      />
    );
    fireEvent.click(screen.getByLabelText(`Move ${QUEUE_ITEM.title} down`));
    expect(onMove).toHaveBeenCalledWith(QUEUE_ITEM.id, "down");
    fireEvent.click(screen.getByLabelText(`Remove ${QUEUE_ITEM.title} from queue`));
    expect(onRemove).toHaveBeenCalledWith(QUEUE_ITEM.id);
  });

  it("disables moving the first item up and the last item down", () => {
    const secondItem = { ...QUEUE_ITEM, id: "v3", title: "Above the fjords" };
    render(
      <QueuePanel
        nowPlaying={NOW_PLAYING}
        queue={[QUEUE_ITEM, secondItem]}
        onMove={vi.fn()}
        onRemove={vi.fn()}
        onAdd={vi.fn()}
      />
    );
    expect(screen.getByLabelText(`Move ${QUEUE_ITEM.title} up`)).toBeDisabled();
    expect(screen.getByLabelText(`Move ${secondItem.title} down`)).toBeDisabled();
  });
});
