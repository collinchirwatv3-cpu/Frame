import { renderHook, waitFor, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Handler = () => void;

function makeFakeChannel() {
  const handlers = new Map<string, Handler>();
  let subscribeCb: ((status: string) => void) | undefined;
  return {
    on(type: string, filter: { event: string; table?: string }, cb: Handler) {
      handlers.set(`${type}:${filter.table ?? filter.event}`, cb);
      return this;
    },
    subscribe(cb?: (status: string) => void) {
      subscribeCb = cb;
      cb?.("SUBSCRIBED");
      return this;
    },
    _fire(table: string) {
      handlers.get(`postgres_changes:${table}`)?.();
    },
    // Lets a test simulate a later status change on this SAME channel
    // instance — a drop (CHANNEL_ERROR/TIMED_OUT/CLOSED) or Supabase's own
    // automatic reconnect (another SUBSCRIBED) — without tearing the
    // channel down and recreating it, exactly like the real client does.
    _status(status: string) {
      subscribeCb?.(status);
    },
  };
}

let channels: ReturnType<typeof makeFakeChannel>[] = [];
function currentChannel() {
  return channels[channels.length - 1];
}
const channelSpy = vi.fn();
const removeChannelSpy = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    channel: (topic: string) => {
      channelSpy(topic);
      const ch = makeFakeChannel();
      channels.push(ch);
      return ch;
    },
    removeChannel: removeChannelSpy,
  }),
}));

type Row = { messageId: string; userId: string; emoji: string };
type QueuedResult = { rows: Row[] } | "throw";
type PendingCall = { ids: string[]; resolve: (rows: Row[]) => void; reject: (e: Error) => void };

// Two ways to control a fetchReactions call, freely mixed within one test:
// push a result onto `queue` for it to resolve immediately (most tests —
// order/timing doesn't matter), or leave `queue` empty so the call instead
// parks a resolver on `pending` for the test to settle by hand at a chosen
// moment (the overlap/stale-response tests, where exact sequencing is the
// whole point).
let queue: QueuedResult[] = [];
let pending: PendingCall[] = [];
const fetchReactionsSpy = vi.fn();

vi.mock("@/lib/dm-reactions", () => ({
  fetchReactions: (threadId: string, messageIds: string[]) => {
    fetchReactionsSpy(threadId, messageIds);
    const next = queue.shift();
    if (next !== undefined) {
      if (next === "throw") return Promise.reject(new Error("network down"));
      return Promise.resolve(next.rows);
    }
    return new Promise<Row[]>((resolve, reject) => {
      pending.push({ ids: messageIds, resolve, reject });
    });
  },
}));

const { useDMReactions } = await import("./use-dm-reactions");

beforeEach(() => {
  channels = [];
  channelSpy.mockClear();
  removeChannelSpy.mockClear();
  fetchReactionsSpy.mockClear();
  queue = [];
  pending = [];
});

describe("useDMReactions", () => {
  it("does nothing when signed out — no fetch, no subscription", () => {
    renderHook(() => useDMReactions("t1", null, ["m1"]));
    expect(fetchReactionsSpy).not.toHaveBeenCalled();
    expect(channelSpy).not.toHaveBeenCalled();
  });

  it("does nothing with zero message ids — nothing to react to yet", () => {
    renderHook(() => useDMReactions("t1", "u1", []));
    expect(fetchReactionsSpy).not.toHaveBeenCalled();
  });

  it("fetches reactions for the given thread and message ids on mount", async () => {
    queue = [{ rows: [{ messageId: "m1", userId: "u1", emoji: "❤️" }] }];
    const { result } = renderHook(() => useDMReactions("t1", "u1", ["m1", "m2"]));
    await waitFor(() => expect(result.current.reactions).toHaveLength(1));
    expect(fetchReactionsSpy).toHaveBeenCalledWith("t1", ["m1", "m2"]);
  });

  it("subscribes to realtime changes on dm_reactions scoped to the thread, once", () => {
    renderHook(() => useDMReactions("t1", "u1", ["m1"]));
    expect(channelSpy).toHaveBeenCalledTimes(1);
    expect(channelSpy).toHaveBeenCalledWith("dm-reactions:t1:u1");
  });

  it("refetches everything known when a dm_reactions change fires", async () => {
    queue = [{ rows: [] }, { rows: [{ messageId: "m1", userId: "u2", emoji: "👍" }] }];
    const { result } = renderHook(() => useDMReactions("t1", "u1", ["m1"]));
    await waitFor(() => expect(fetchReactionsSpy).toHaveBeenCalledTimes(1));
    await act(async () => {
      currentChannel()._fire("dm_reactions");
    });
    await waitFor(() => expect(result.current.reactions).toEqual([{ messageId: "m1", userId: "u2", emoji: "👍" }]));
  });

  it("retry() triggers a fresh fetch, with no realtime event involved", async () => {
    queue = [{ rows: [] }, { rows: [{ messageId: "m1", userId: "u1", emoji: "😮" }] }];
    const { result } = renderHook(() => useDMReactions("t1", "u1", ["m1"]));
    await waitFor(() => expect(fetchReactionsSpy).toHaveBeenCalledTimes(1));
    act(() => {
      result.current.retry();
    });
    await waitFor(() => expect(result.current.reactions).toEqual([{ messageId: "m1", userId: "u1", emoji: "😮" }]));
    expect(fetchReactionsSpy).toHaveBeenCalledTimes(2);
  });

  it("unsubscribes on unmount", () => {
    const { unmount } = renderHook(() => useDMReactions("t1", "u1", ["m1"]));
    const channel = currentChannel();
    unmount();
    expect(removeChannelSpy).toHaveBeenCalledWith(channel);
  });

  // --- Preserving reactions as message history changes -------------------

  it("receiving a new message preserves existing reactions, fetches only the new id, and never recreates the subscription", async () => {
    queue = [
      { rows: [{ messageId: "m1", userId: "u2", emoji: "❤️" }] },
      { rows: [{ messageId: "m2", userId: "u2", emoji: "👍" }] },
    ];
    const { result, rerender } = renderHook(({ ids }: { ids: string[] }) => useDMReactions("t1", "u1", ids), {
      initialProps: { ids: ["m1"] },
    });
    await waitFor(() => expect(result.current.reactions).toEqual([{ messageId: "m1", userId: "u2", emoji: "❤️" }]));
    expect(channelSpy).toHaveBeenCalledTimes(1);

    rerender({ ids: ["m1", "m2"] }); // a new message arrives
    await waitFor(() =>
      expect(result.current.reactions).toEqual(
        expect.arrayContaining([
          { messageId: "m1", userId: "u2", emoji: "❤️" },
          { messageId: "m2", userId: "u2", emoji: "👍" },
        ])
      )
    );
    expect(result.current.reactions).toHaveLength(2);
    expect(fetchReactionsSpy).toHaveBeenNthCalledWith(2, "t1", ["m2"]);
    expect(channelSpy).toHaveBeenCalledTimes(1); // still just the one subscription
  });

  it("loading older history preserves already-known reactions and fetches only the newly loaded ids", async () => {
    queue = [
      { rows: [{ messageId: "m5", userId: "u2", emoji: "🙏" }] },
      { rows: [{ messageId: "m1", userId: "u1", emoji: "😮" }] },
    ];
    const { result, rerender } = renderHook(({ ids }: { ids: string[] }) => useDMReactions("t1", "u1", ids), {
      initialProps: { ids: ["m5"] },
    });
    await waitFor(() => expect(result.current.reactions).toHaveLength(1));

    rerender({ ids: ["m1", "m5"] }); // "Load earlier messages" prepends m1
    await waitFor(() => expect(result.current.reactions).toHaveLength(2));
    expect(result.current.reactions).toEqual(
      expect.arrayContaining([
        { messageId: "m5", userId: "u2", emoji: "🙏" },
        { messageId: "m1", userId: "u1", emoji: "😮" },
      ])
    );
    expect(fetchReactionsSpy).toHaveBeenNthCalledWith(2, "t1", ["m1"]);
    expect(channelSpy).toHaveBeenCalledTimes(1);
  });

  it("a failed fetch for newly-loaded messages surfaces an error but keeps already-loaded reactions", async () => {
    queue = [{ rows: [{ messageId: "m1", userId: "u1", emoji: "❤️" }] }, "throw"];
    const { result, rerender } = renderHook(({ ids }: { ids: string[] }) => useDMReactions("t1", "u1", ids), {
      initialProps: { ids: ["m1"] },
    });
    await waitFor(() => expect(result.current.reactions).toHaveLength(1));

    rerender({ ids: ["m1", "m2"] });
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.reactions).toEqual([{ messageId: "m1", userId: "u1", emoji: "❤️" }]);
  });

  // --- Decoupling loading from realtime availability ----------------------

  it("HTTP loading succeeds independently of realtime — a subscription failure surfaces as degraded without discarding fetched data", async () => {
    queue = [{ rows: [{ messageId: "m1", userId: "u1", emoji: "❤️" }] }];
    const { result } = renderHook(() => useDMReactions("t1", "u1", ["m1"]));
    await waitFor(() => expect(result.current.reactions).toEqual([{ messageId: "m1", userId: "u1", emoji: "❤️" }]));
    expect(result.current.error).toBe(false);

    act(() => {
      currentChannel()._status("CHANNEL_ERROR");
    });
    expect(result.current.error).toBe(true);
    expect(result.current.reactions).toEqual([{ messageId: "m1", userId: "u1", emoji: "❤️" }]);
  });

  it("reconnecting on the same channel after a drop refreshes everything known, and clears the degraded state", async () => {
    queue = [
      { rows: [{ messageId: "m1", userId: "u1", emoji: "❤️" }] },
      { rows: [{ messageId: "m1", userId: "u2", emoji: "👍" }] },
    ];
    const { result } = renderHook(() => useDMReactions("t1", "u1", ["m1"]));
    await waitFor(() => expect(result.current.reactions).toEqual([{ messageId: "m1", userId: "u1", emoji: "❤️" }]));
    const channel = currentChannel();

    act(() => channel._status("TIMED_OUT"));
    expect(result.current.error).toBe(true);

    await act(async () => channel._status("SUBSCRIBED")); // Supabase's own automatic reconnect of the SAME channel
    await waitFor(() => expect(result.current.reactions).toEqual([{ messageId: "m1", userId: "u2", emoji: "👍" }]));
    expect(result.current.error).toBe(false);
    expect(channelSpy).toHaveBeenCalledTimes(1); // never recreated
  });

  it("retry() recovers from a degraded subscription by resubscribing and refetching", async () => {
    queue = [
      { rows: [{ messageId: "m1", userId: "u1", emoji: "❤️" }] },
      { rows: [{ messageId: "m1", userId: "u1", emoji: "❤️" }] },
    ];
    const { result } = renderHook(() => useDMReactions("t1", "u1", ["m1"]));
    await waitFor(() => expect(result.current.reactions).toHaveLength(1));

    act(() => currentChannel()._status("CHANNEL_ERROR"));
    expect(result.current.error).toBe(true);

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.error).toBe(false));
    expect(channelSpy).toHaveBeenCalledTimes(2); // resubscribed
  });

  it("overlapping requests: a realtime event during an in-flight new-message fetch is queued, not raced", async () => {
    const { result, rerender } = renderHook(({ ids }: { ids: string[] }) => useDMReactions("t1", "u1", ids), {
      initialProps: { ids: ["m1"] },
    });
    await waitFor(() => expect(pending).toHaveLength(1));
    pending[0].resolve([{ messageId: "m1", userId: "u1", emoji: "❤️" }]);
    await waitFor(() => expect(result.current.reactions).toHaveLength(1));

    rerender({ ids: ["m1", "m2"] }); // a new message arrives, kicking off an in-flight fetch for m2
    await waitFor(() => expect(pending).toHaveLength(2));

    act(() => {
      currentChannel()._fire("dm_reactions"); // a reaction change lands while that fetch is still in flight
    });
    // Queued behind the in-flight call, not raced as a second concurrent request.
    expect(pending).toHaveLength(2);

    await act(async () => {
      pending[1].resolve([{ messageId: "m2", userId: "u1", emoji: "👍" }]);
    });
    // The queued realtime-triggered refetch now runs, covering everything known.
    await waitFor(() => expect(pending).toHaveLength(3));
    expect(pending[2].ids).toEqual(expect.arrayContaining(["m1", "m2"]));

    await act(async () => {
      pending[2].resolve([
        { messageId: "m1", userId: "u2", emoji: "🙏" },
        { messageId: "m2", userId: "u1", emoji: "👍" },
      ]);
    });
    await waitFor(() =>
      expect(result.current.reactions).toEqual(
        expect.arrayContaining([
          { messageId: "m1", userId: "u2", emoji: "🙏" },
          { messageId: "m2", userId: "u1", emoji: "👍" },
        ])
      )
    );
    expect(fetchReactionsSpy).toHaveBeenCalledTimes(3);
  });

  it("a stale response for an old thread/account never overwrites a newer identity's state", async () => {
    const { result, rerender } = renderHook(({ tid }: { tid: string }) => useDMReactions(tid, "u1", ["m1"]), {
      initialProps: { tid: "t1" },
    });
    await waitFor(() => expect(pending).toHaveLength(1));
    const staleCall = pending[0];

    rerender({ tid: "t2" }); // navigates to a different thread while the first fetch is still in flight
    await waitFor(() => expect(pending).toHaveLength(2));

    await act(async () => {
      pending[1].resolve([{ messageId: "m1", userId: "u1", emoji: "🙏" }]); // t2's own fetch settles first
    });
    await waitFor(() => expect(result.current.reactions).toEqual([{ messageId: "m1", userId: "u1", emoji: "🙏" }]));

    await act(async () => {
      staleCall.resolve([{ messageId: "m1", userId: "u1", emoji: "❤️" }]); // t1's stale fetch finally resolves
    });
    expect(result.current.reactions).toEqual([{ messageId: "m1", userId: "u1", emoji: "🙏" }]);
  });
});
