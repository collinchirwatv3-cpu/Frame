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

// `status` mimics what Supabase Realtime actually reports once
// `private: true` is set (see use-watch-room.ts): "SUBSCRIBED" for a
// connection the RLS policy on realtime.messages allowed through,
// "CHANNEL_ERROR" for one it rejected. Defaults to the happy path — only
// the denial test overrides it.
function createFakeChannel(status: "SUBSCRIBED" | "CHANNEL_ERROR" = "SUBSCRIBED") {
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
      cb(status);
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
const channelSpy = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    channel: (topic: string, config: unknown) => {
      channelSpy(topic, config);
      return fakeChannel;
    },
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

// Real membership/authorization is enforced server-side (RLS on
// realtime.messages, keyed off `private: true` — see
// supabase/migrations/20260808050000_watch_room_realtime_rls.sql and this
// module's own doc comment), not in this hook. What's actually unit-
// testable here is (a) that the hook asks Realtime for a private/
// authenticated channel at all, and (b) that a real server-side rejection
// surfaces as `denied` instead of a silently frozen room. Whether a
// specific non-member/unauthenticated caller is actually rejected is a
// live-database property, verified separately the same way the invite
// gate was (real Supabase connections, real bypass attempts) — not
// something a mocked channel can honestly assert.
describe("useWatchRoom — authorization", () => {
  it("opens the channel as private, so Realtime Authorization RLS actually applies", () => {
    const videoRef = { current: createFakeVideo() };
    renderHook(() => useWatchRoom("room-1", "v1", videoRef));

    expect(channelSpy).toHaveBeenCalledWith(
      "watch-room:room-1",
      expect.objectContaining({ config: expect.objectContaining({ private: true }) })
    );
  });

  it("surfaces a server-side rejection as `denied` rather than a silently frozen room", () => {
    fakeChannel = createFakeChannel("CHANNEL_ERROR");
    const videoRef = { current: createFakeVideo() };
    const { result } = renderHook(() => useWatchRoom("room-1", "v1", videoRef));

    expect(result.current.denied).toBe(true);
    // Never got to track presence — the connection was rejected before that.
    expect(fakeChannel.track).not.toHaveBeenCalled();
  });

  it("does not report denied on a normal, accepted connection", () => {
    const videoRef = { current: createFakeVideo() };
    const { result } = renderHook(() => useWatchRoom("room-1", "v1", videoRef));

    expect(result.current.denied).toBe(false);
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

// Product rule (see use-watch-room.ts's own doc comment): the queue is
// deliberately collaborative. Host status is a sync-authority role, not an
// authorization boundary — host-only queue control was considered and
// explicitly rejected as wrong for this product. Every test below exists
// in a host and a non-host/participant variant specifically to prove
// neither addToQueue nor advanceQueue is gated by isHost.
describe("useWatchRoom — queue (collaborative — host and participant both allowed)", () => {
  it("host can add a video to the queue", () => {
    const videoRef = { current: createFakeVideo() };
    const { result } = renderHook(() => useWatchRoom("room-1", "v1", videoRef));
    act(() => {
      fakeChannel._setPresence({ "self-id": [{ joinedAt: 100 }] });
      fakeChannel._fire("presence", "sync", undefined);
    });
    expect(result.current.isHost).toBe(true);

    const item = { id: "vid-2", title: "Next up", posterUrl: "p.jpg", creatorUsername: "reddrift" };
    act(() => result.current.addToQueue(item));

    expect(result.current.queue).toEqual([item]);
    expect(fakeChannel._sent.at(-1)).toEqual({ event: "queue-set", payload: [item] });
  });

  it("a non-host participant can add a video to the queue", () => {
    const videoRef = { current: createFakeVideo() };
    const { result } = renderHook(() => useWatchRoom("room-1", "v1", videoRef));
    // Never fired a presence sync where self is earliest — isHost stays
    // false (its default).
    expect(result.current.isHost).toBe(false);

    const item = { id: "vid-2", title: "Next", posterUrl: "", creatorUsername: "x" };
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

  it("a queue-set broadcast from another participant updates this participant's own queue state", () => {
    // Covers "participant can see the resulting queue state" / "queue
    // changes synchronize to all party members" — this is the receiving
    // side (someone ELSE's mutation arriving here), not this client's own
    // addToQueue/removeFromQueue/moveQueueItem (already covered above,
    // and all three already broadcast via this same queue-set event).
    const videoRef = { current: createFakeVideo() };
    const { result } = renderHook(() => useWatchRoom("room-1", "v1", videoRef));
    const item = { id: "vid-9", title: "Added by someone else", posterUrl: "", creatorUsername: "reddrift" };

    act(() => {
      fakeChannel._fire("broadcast", "queue-set", { payload: [item] });
    });

    expect(result.current.queue).toEqual([item]);
  });
});

describe("useWatchRoom — advanceQueue (collaborative — host and participant both allowed)", () => {
  it("host can advance the queue", () => {
    const videoRef = { current: createFakeVideo() };
    const { result } = renderHook(() => useWatchRoom("room-1", "v1", videoRef));
    act(() => {
      fakeChannel._setPresence({ "self-id": [{ joinedAt: 100 }] });
      fakeChannel._fire("presence", "sync", undefined);
    });
    expect(result.current.isHost).toBe(true);

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

  it("a non-host participant can advance the queue — not host-gated, by design", () => {
    const videoRef = { current: createFakeVideo() };
    const { result } = renderHook(() => useWatchRoom("room-1", "v1", videoRef));
    expect(result.current.isHost).toBe(false);

    const next = { id: "vid-2", title: "Next", posterUrl: "", creatorUsername: "x" };
    act(() => result.current.addToQueue(next));
    act(() => result.current.advanceQueue());

    expect(result.current.currentVideoId).toBe("vid-2");
    expect(fakeChannel._sent.at(-1)).toEqual({
      event: "advance",
      payload: { videoId: "vid-2", queue: [] },
    });
  });

  it("an advance broadcast from another participant updates this participant's video and queue too", () => {
    const videoRef = { current: createFakeVideo() };
    const { result } = renderHook(() => useWatchRoom("room-1", "v1", videoRef));

    act(() => {
      fakeChannel._fire("broadcast", "advance", {
        payload: { videoId: "vid-7", queue: [] },
      });
    });

    expect(result.current.currentVideoId).toBe("vid-7");
    expect(result.current.queue).toEqual([]);
  });

  it("rejects the invalid transition of advancing an already-empty queue (no-op, no broadcast)", () => {
    const videoRef = { current: createFakeVideo() };
    const { result } = renderHook(() => useWatchRoom("room-1", "v1", videoRef));

    const sentBefore = fakeChannel._sent.length;
    act(() => result.current.advanceQueue());

    expect(result.current.currentVideoId).toBe("v1");
    expect(fakeChannel._sent.length).toBe(sentBefore);
  });
});
