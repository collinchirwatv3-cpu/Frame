import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Same fake-channel shape as use-party-presence-count.test.ts's own
// convention (that file's comment explains why this is duplicated locally
// rather than shared).
type Handler = (arg: unknown) => void;

function createFakeChannel() {
  const handlers = new Map<string, Handler>();
  return {
    on(type: string, filter: { event: string }, cb: Handler) {
      handlers.set(`${type}:${filter.event}`, cb);
      return this;
    },
    subscribe(cb?: (status: string) => void) {
      cb?.("SUBSCRIBED");
      return this;
    },
    _fire(type: string, event: string, arg: unknown) {
      handlers.get(`${type}:${event}`)?.(arg);
    },
  };
}

let fakeChannel: ReturnType<typeof createFakeChannel>;
const channelSpy = vi.fn();
const removeChannelSpy = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    channel: (topic: string) => {
      channelSpy(topic);
      return fakeChannel;
    },
    removeChannel: removeChannelSpy,
  }),
}));

const { useNotificationsRealtime } = await import("./use-notifications-realtime");

beforeEach(() => {
  fakeChannel = createFakeChannel();
  channelSpy.mockClear();
  removeChannelSpy.mockClear();
});

describe("useNotificationsRealtime", () => {
  it("does not subscribe when signed out", () => {
    renderHook(() => useNotificationsRealtime(null, vi.fn()));
    expect(channelSpy).not.toHaveBeenCalled();
  });

  it("subscribes to a channel scoped to this user's own id", () => {
    renderHook(() => useNotificationsRealtime("user-1", vi.fn()));
    expect(channelSpy).toHaveBeenCalledWith("notifications:user-1");
  });

  it("calls onChange once the subscription is live, without waiting for a real change", () => {
    const onChange = vi.fn();
    renderHook(() => useNotificationsRealtime("user-1", onChange));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("calls onChange again on every postgres_changes event", () => {
    const onChange = vi.fn();
    renderHook(() => useNotificationsRealtime("user-1", onChange));
    fakeChannel._fire("postgres_changes", "*", { eventType: "INSERT" });
    fakeChannel._fire("postgres_changes", "*", { eventType: "UPDATE" });
    expect(onChange).toHaveBeenCalledTimes(3); // subscribe + 2 changes
  });

  it("removes the channel on unmount", () => {
    const { unmount } = renderHook(() => useNotificationsRealtime("user-1", vi.fn()));
    unmount();
    expect(removeChannelSpy).toHaveBeenCalledWith(fakeChannel);
  });

  it("always calls the latest onChange, even if it wasn't memoized by the caller", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ cb }) => useNotificationsRealtime("user-1", cb), {
      initialProps: { cb: first },
    });
    rerender({ cb: second });
    fakeChannel._fire("postgres_changes", "*", {});
    expect(second).toHaveBeenCalled();
  });
});
