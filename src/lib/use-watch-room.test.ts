import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// No existing test anywhere in this repo touches Realtime/Presence, and the
// established Supabase mock pattern (comments-store.test.ts,
// engagement-store.test.ts) only covers `.from()` query chains. This fake
// channel extends that same "mock the module, not the network" convention
// to `.channel()`'s actual surface — `.on/.track/.subscribe/.send` — since
// use-watch-room.ts never imports the RealtimeChannel type by name and
// treats the channel structurally, there's nothing to fight to substitute
// a plain object here.
type Handler = (arg: unknown) => void;

function createFakeChannel() {
  const handlers = new Map<string, Handler>();
  const sent: { event: string; payload: unknown }[] = [];
  const tracked: unknown[] = [];
  let presence: Record<string, { joinedAt: number }[]> = {};

  const channel = {
    on(type: string, filter: { event: string }, cb: Handler) {
      handlers.set(`${type}:${filter.event}`, cb);
      return channel;
    },
    track: vi.fn((meta: unknown) => {
      tracked.push(meta);
      return Promise.resolve("ok");
    }),
    subscribe(cb: (status: string) => void) {
      cb("SUBSCRIBED");
      return channel;
    },
    send: vi.fn((msg: { event: string; payload: unknown }) => {
      sent.push({ event: msg.event, payload: msg.payload });
    }),
    presenceState: () => presence,
    // Test-only helpers, not part of the real RealtimeChannel surface.
    _fire(type: string, event: string, arg: unknown) {
      handlers.get(`${type}:${event}`)?.(arg);
    },
    _setPresence(next: Record<string, { joinedAt: number }[]>) {
      presence = next;
    },
    _sent: sent,
    _tracked: tracked,
  };
  return channel;
}

function createFakeVideo(paused = true): HTMLVideoElement {
  return {
    currentTime: 0,
    paused,
    play: vi.fn(() => Promise.resolve()),
    pause: vi.fn(),
  } as unknown as HTMLVideoElement;
}

let fakeChannel: ReturnType<typeof createFakeChannel>;
const removeChannelSpy = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    channel: () => fakeChannel,
    removeChannel: removeChannelSpy,
  }),
}));

const { useWatchRoom, DRIFT_THRESHOLD_SECONDS, HEARTBEAT_INTERVAL_MS } = await import("./use-watch-room");

beforeEach(() => {
  fakeChannel = createFakeChannel();
  removeChannelSpy.mockClear();
  // selfId is crypto.randomUUID() generated inside the hook (useMemo) — the
  // real implementation has no way to observe it from outside, so tests
  // that need to know "which presence entry is me" pin it to a fixed value.
  vi.spyOn(crypto, "randomUUID").mockReturnValue("self-id" as `${string}-${string}-${string}-${string}-${string}`);
});

describe("useWatchRoom — host election", () => {
  it("becomes host when it's the only (earliest) participant", () => {
    const videoRef = { current: createFakeVideo() };
    const { result } = renderHook(() => useWatchRoom("room-1", "v1", videoRef));

    act(() => {
      fakeChannel._setPresence({ "self-id": [{ joinedAt: 100 }] });
      fakeChannel._fire("presence", "sync", undefined);
    });

    expect(result.current.isHost).toBe(true);
    expect(result.current.participants).toEqual([{ id: "self-id", joinedAt: 100 }]);
  });

  it("does not become host when someone else joined earlier", () => {
    const videoRef = { current: createFakeVideo() };
    const { result } = renderHook(() => useWatchRoom("room-1", "v1", videoRef));

    act(() => {
      fakeChannel._setPresence({
        "other-id": [{ joinedAt: 50 }],
        "self-id": [{ joinedAt: 100 }],
      });
      fakeChannel._fire("presence", "sync", undefined);
    });

    expect(result.current.isHost).toBe(false);
    expect(result.current.participants[0].id).toBe("other-id");
  });

  it("hands host to the next-earliest participant when the host leaves", () => {
    const videoRef = { current: createFakeVideo() };
    const { result } = renderHook(() => useWatchRoom("room-1", "v1", videoRef));

    act(() => {
      fakeChannel._setPresence({
        "other-id": [{ joinedAt: 50 }],
        "self-id": [{ joinedAt: 100 }],
      });
      fakeChannel._fire("presence", "sync", undefined);
    });
    expect(result.current.isHost).toBe(false);

    // "other-id" disconnects — presence sync fires again with only self left.
    act(() => {
      fakeChannel._setPresence({ "self-id": [{ joinedAt: 100 }] });
      fakeChannel._fire("presence", "sync", undefined);
    });
    expect(result.current.isHost).toBe(true);
  });

  it("cleans up the channel on unmount", () => {
    const videoRef = { current: createFakeVideo() };
    const { unmount } = renderHook(() => useWatchRoom("room-1", "v1", videoRef));
    unmount();
    expect(removeChannelSpy).toHaveBeenCalledWith(fakeChannel);
  });
});

describe("useWatchRoom — playback sync", () => {
  it("hard-seeks when drift exceeds the threshold", () => {
    const video = createFakeVideo();
    video.currentTime = 0;
    const videoRef = { current: video };
    renderHook(() => useWatchRoom("room-1", "v1", videoRef));

    act(() => {
      fakeChannel._fire("broadcast", "sync", {
        payload: { time: 10, paused: false, at: Date.now() - DRIFT_THRESHOLD_SECONDS * 2 * 1000 },
      });
    });

    // target = 10 + ~3s elapsed = ~13, well past the 1.5s threshold from 0.
    expect(video.currentTime).toBeGreaterThan(10);
    expect(video.play).toHaveBeenCalled();
  });

  it("does not seek for drift within the threshold", () => {
    const video = createFakeVideo();
    video.currentTime = 10;
    const videoRef = { current: video };
    renderHook(() => useWatchRoom("room-1", "v1", videoRef));

    act(() => {
      // paused:true means no elapsed-time extrapolation — target is exactly
      // 10, matching currentTime already, so no seek should occur.
      fakeChannel._fire("broadcast", "sync", { payload: { time: 10, paused: true, at: Date.now() } });
    });

    expect(video.currentTime).toBe(10);
    expect(video.pause).toHaveBeenCalled();
  });

  it("only extrapolates elapsed time when the broadcast wasn't paused", () => {
    const video = createFakeVideo();
    video.currentTime = 0;
    const videoRef = { current: video };
    renderHook(() => useWatchRoom("room-1", "v1", videoRef));

    act(() => {
      // Paused broadcast sent 10s ago — if elapsed were (wrongly) added,
      // this would seek to ~15; it should seek to exactly 5.
      fakeChannel._fire("broadcast", "sync", {
        payload: { time: 5, paused: true, at: Date.now() - 10_000 },
      });
    });

    expect(video.currentTime).toBe(5);
  });
});

describe("useWatchRoom — heartbeat", () => {
  beforeEach(() => vi.useFakeTimers());

  it("only the host broadcasts a heartbeat, and only while playing", () => {
    const video = createFakeVideo(false);
    const videoRef = { current: video };
    const { result } = renderHook(() => useWatchRoom("room-1", "v1", videoRef));

    act(() => {
      fakeChannel._setPresence({ "self-id": [{ joinedAt: 100 }] });
      fakeChannel._fire("presence", "sync", undefined);
    });
    expect(result.current.isHost).toBe(true);

    const sentBefore = fakeChannel._sent.length;
    act(() => {
      vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS);
    });
    expect(fakeChannel._sent.length).toBeGreaterThan(sentBefore);
    expect(fakeChannel._sent.at(-1)).toMatchObject({ event: "sync" });
  });

  it("does not broadcast a heartbeat while paused, even as host", () => {
    const video = createFakeVideo(true);
    const videoRef = { current: video };
    const { result } = renderHook(() => useWatchRoom("room-1", "v1", videoRef));

    act(() => {
      fakeChannel._setPresence({ "self-id": [{ joinedAt: 100 }] });
      fakeChannel._fire("presence", "sync", undefined);
    });
    expect(result.current.isHost).toBe(true);

    const sentBefore = fakeChannel._sent.length;
    act(() => {
      vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS);
    });
    expect(fakeChannel._sent.length).toBe(sentBefore);
  });
});

describe("useWatchRoom — queue", () => {
  it("addToQueue broadcasts the full updated array, not a diff", () => {
    const videoRef = { current: createFakeVideo() };
    const { result } = renderHook(() => useWatchRoom("room-1", "v1", videoRef));
    const item = { id: "vid-2", title: "Next up", posterUrl: "p.jpg", creatorUsername: "reddrift" };

    act(() => result.current.addToQueue(item));

    expect(result.current.queue).toEqual([item]);
    expect(fakeChannel._sent.at(-1)).toEqual({ event: "queue-set", payload: [item] });
  });

  it("removeFromQueue broadcasts the array without the removed item", () => {
    const videoRef = { current: createFakeVideo() };
    const { result } = renderHook(() => useWatchRoom("room-1", "v1", videoRef));
    const a = { id: "a", title: "A", posterUrl: "", creatorUsername: "x" };
    const b = { id: "b", title: "B", posterUrl: "", creatorUsername: "x" };

    act(() => result.current.addToQueue(a));
    act(() => result.current.addToQueue(b));
    act(() => result.current.removeFromQueue("a"));

    expect(result.current.queue).toEqual([b]);
    expect(fakeChannel._sent.at(-1)).toEqual({ event: "queue-set", payload: [b] });
  });

  it("moveQueueItem swaps adjacent items and broadcasts the new order", () => {
    const videoRef = { current: createFakeVideo() };
    const { result } = renderHook(() => useWatchRoom("room-1", "v1", videoRef));
    const a = { id: "a", title: "A", posterUrl: "", creatorUsername: "x" };
    const b = { id: "b", title: "B", posterUrl: "", creatorUsername: "x" };

    act(() => result.current.addToQueue(a));
    act(() => result.current.addToQueue(b));
    act(() => result.current.moveQueueItem("b", "up"));

    expect(result.current.queue).toEqual([b, a]);
  });

  it("queue mutations are a free-for-all — not gated by host status (matches the hook's own documented design, not a bug)", () => {
    const videoRef = { current: createFakeVideo() };
    const { result } = renderHook(() => useWatchRoom("room-1", "v1", videoRef));
    // Never fired a presence sync — isHost is false (its default) here.
    expect(result.current.isHost).toBe(false);

    const item = { id: "vid-2", title: "Next", posterUrl: "", creatorUsername: "x" };
    act(() => result.current.addToQueue(item));

    expect(result.current.queue).toEqual([item]);
  });
});

describe("useWatchRoom — advanceQueue", () => {
  it("advances to the next queued video and broadcasts it", () => {
    const videoRef = { current: createFakeVideo() };
    const { result } = renderHook(() => useWatchRoom("room-1", "v1", videoRef));
    const next = { id: "vid-2", title: "Next", posterUrl: "", creatorUsername: "x" };

    act(() => result.current.addToQueue(next));
    act(() => result.current.advanceQueue());

    expect(result.current.currentVideoId).toBe("vid-2");
    expect(result.current.queue).toEqual([]);
    expect(fakeChannel._sent.at(-1)).toEqual({
      event: "advance",
      payload: { videoId: "vid-2", queue: [] },
    });
  });

  it("is a no-op with an empty queue", () => {
    const videoRef = { current: createFakeVideo() };
    const { result } = renderHook(() => useWatchRoom("room-1", "v1", videoRef));

    act(() => result.current.advanceQueue());

    expect(result.current.currentVideoId).toBe("v1");
  });

  // Documenting real, current behavior rather than asserting a protection
  // that doesn't exist: advanceQueue has no host check inside the hook
  // itself (see use-watch-room.ts's own doc comment — "Authority-only" is
  // enforced only by the caller, WatchTogetherPlayer.tsx's onEnded, not
  // here). A non-host calling it directly still works. This is a real,
  // accepted gap (no server-side authority for this open Realtime channel,
  // by design — see the module doc comment), not something this test
  // suite fixes; flagged in the final report rather than papered over.
  it("advances the queue even when called by a non-host (no server-side authority check — a known, accepted gap)", () => {
    const videoRef = { current: createFakeVideo() };
    const { result } = renderHook(() => useWatchRoom("room-1", "v1", videoRef));
    expect(result.current.isHost).toBe(false);

    const next = { id: "vid-2", title: "Next", posterUrl: "", creatorUsername: "x" };
    act(() => result.current.addToQueue(next));
    act(() => result.current.advanceQueue());

    expect(result.current.currentVideoId).toBe("vid-2");
  });
});
