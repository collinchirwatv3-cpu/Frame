import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Same fake-channel shape as use-watch-room.test.ts's own convention —
// duplicated locally rather than imported, since that file doesn't export
// its fake (see that file's own comment on why this pattern exists at all).
type Handler = (arg: unknown) => void;

function createFakeChannel() {
  const handlers = new Map<string, Handler>();
  let presence: Record<string, unknown[]> = {};
  const trackSpy = vi.fn();

  return {
    on(type: string, filter: { event: string }, cb: Handler) {
      handlers.set(`${type}:${filter.event}`, cb);
      return this;
    },
    track: trackSpy,
    subscribe(cb?: (status: string) => void) {
      cb?.("SUBSCRIBED");
      return this;
    },
    presenceState: () => presence,
    _fire(type: string, event: string, arg: unknown) {
      handlers.get(`${type}:${event}`)?.(arg);
    },
    _setPresence(next: Record<string, unknown[]>) {
      presence = next;
    },
    _trackSpy: trackSpy,
  };
}

let fakeChannel: ReturnType<typeof createFakeChannel>;
const channelSpy = vi.fn();
const removeChannelSpy = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    channel: (topic: string, config: unknown) => {
      channelSpy(topic, config);
      return fakeChannel;
    },
    removeChannel: removeChannelSpy,
  }),
}));

const { usePartyPresenceCount } = await import("./use-party-presence-count");

beforeEach(() => {
  fakeChannel = createFakeChannel();
  channelSpy.mockClear();
  removeChannelSpy.mockClear();
});

describe("usePartyPresenceCount", () => {
  it("does not subscribe at all when disabled", () => {
    renderHook(() => usePartyPresenceCount("party-1", false));
    expect(channelSpy).not.toHaveBeenCalled();
  });

  it("opens the same watch-room:{partyId} topic as the real in-party room, as a private channel", () => {
    renderHook(() => usePartyPresenceCount("party-1", true));
    expect(channelSpy).toHaveBeenCalledWith(
      "watch-room:party-1",
      expect.objectContaining({ config: expect.objectContaining({ private: true }) })
    );
  });

  it("never tracks its own presence — a pure observer shouldn't inflate the count", () => {
    renderHook(() => usePartyPresenceCount("party-1", true));
    expect(fakeChannel._trackSpy).not.toHaveBeenCalled();
  });

  it("reflects the number of entries in presence state once synced", () => {
    const { result } = renderHook(() => usePartyPresenceCount("party-1", true));
    expect(result.current).toBe(0);

    act(() => {
      fakeChannel._setPresence({ "viewer-a": [{}], "viewer-b": [{}] });
      fakeChannel._fire("presence", "sync", undefined);
    });
    expect(result.current).toBe(2);
  });

  it("removes the channel and resets to 0 when disabled again (scrolled out of view)", () => {
    const { result, rerender } = renderHook(({ enabled }) => usePartyPresenceCount("party-1", enabled), {
      initialProps: { enabled: true },
    });
    act(() => {
      fakeChannel._setPresence({ "viewer-a": [{}] });
      fakeChannel._fire("presence", "sync", undefined);
    });
    expect(result.current).toBe(1);

    rerender({ enabled: false });
    expect(removeChannelSpy).toHaveBeenCalledWith(fakeChannel);
    expect(result.current).toBe(0);
  });
});
