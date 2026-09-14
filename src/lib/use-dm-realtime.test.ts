import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Handler = (arg: unknown) => void;

function createFakeChannel() {
  const handlers = new Map<string, Handler>();
  return {
    on(type: string, filter: { event: string; table?: string }, cb: Handler) {
      handlers.set(`${type}:${filter.table ?? filter.event}`, cb);
      return this;
    },
    subscribe(cb?: (status: string) => void) {
      cb?.("SUBSCRIBED");
      return this;
    },
    _fire(table: string) {
      handlers.get(`postgres_changes:${table}`)?.({});
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

const { useDMRealtime } = await import("./use-dm-realtime");

beforeEach(() => {
  fakeChannel = createFakeChannel();
  channelSpy.mockClear();
  removeChannelSpy.mockClear();
});

describe("useDMRealtime", () => {
  it("does not subscribe when signed out", () => {
    renderHook(() => useDMRealtime(null, vi.fn()));
    expect(channelSpy).not.toHaveBeenCalled();
  });

  it("subscribes once on mount", () => {
    const onChange = vi.fn();
    renderHook(() => useDMRealtime("u1", onChange));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("calls onChange on a dm_threads change (a new thread appearing)", () => {
    const onChange = vi.fn();
    renderHook(() => useDMRealtime("u1", onChange));
    fakeChannel._fire("dm_threads");
    expect(onChange).toHaveBeenCalledTimes(2); // subscribe + this change
  });

  it("calls onChange on a dm_messages change (a new message arriving)", () => {
    const onChange = vi.fn();
    renderHook(() => useDMRealtime("u1", onChange));
    fakeChannel._fire("dm_messages");
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("removes the channel on unmount", () => {
    const { unmount } = renderHook(() => useDMRealtime("u1", vi.fn()));
    unmount();
    expect(removeChannelSpy).toHaveBeenCalledWith(fakeChannel);
  });
});
