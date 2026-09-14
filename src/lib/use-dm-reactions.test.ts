import { renderHook, waitFor, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Handler = () => void;

// When true, `.subscribe()` stores its callback but does NOT fire
// SUBSCRIBED synchronously — the test drives confirmation later via
// `_status("SUBSCRIBED")`, to control exactly when (relative to other
// async work, like the initial HTTP fetch) confirmation lands.
let deferSubscribeConfirmation = false;

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
      if (!deferSubscribeConfirmation) cb?.("SUBSCRIBED");
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
  deferSubscribeConfirmation = false;
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
    // Mount alone produces two calls (initial fetch + catch-up on the
    // first SUBSCRIBED confirmation). retry() tears down and resubscribes
    // a NEW channel, which now ALSO gets an unconditional catch-up on ITS
    // own first SUBSCRIBED (bug fix below), on top of retry's own
    // top-of-effect refresh — two more calls, four total.
    queue = [
      { rows: [] },
      { rows: [{ messageId: "m1", userId: "u1", emoji: "🙏" }] },
      { rows: [{ messageId: "m1", userId: "u1", emoji: "🙏" }] },
      { rows: [{ messageId: "m1", userId: "u1", emoji: "😮" }] },
    ];
    const { result } = renderHook(() => useDMReactions("t1", "u1", ["m1"]));
    await waitFor(() => expect(result.current.reactions).toEqual([{ messageId: "m1", userId: "u1", emoji: "🙏" }]));
    expect(fetchReactionsSpy).toHaveBeenCalledTimes(2);

    act(() => {
      result.current.retry();
    });
    await waitFor(() => expect(result.current.reactions).toEqual([{ messageId: "m1", userId: "u1", emoji: "😮" }]));
    expect(fetchReactionsSpy).toHaveBeenCalledTimes(4);
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
      { rows: [{ messageId: "m1", userId: "u2", emoji: "❤️" }] }, // initial mount fetch
      { rows: [{ messageId: "m1", userId: "u2", emoji: "❤️" }] }, // catch-up on the first SUBSCRIBED confirmation
      { rows: [{ messageId: "m2", userId: "u2", emoji: "👍" }] }, // incremental fetch for the new message
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
    // The incremental fetch for "m2" can only ever start once the mount's
    // own two fetches (initial + catch-up) have fully settled — scheduleFetch
    // queues behind whichever of those is still in flight — so by the time
    // the state above has genuinely settled, it's deterministically the 3rd call.
    expect(fetchReactionsSpy).toHaveBeenCalledTimes(3);
    expect(fetchReactionsSpy).toHaveBeenNthCalledWith(3, "t1", ["m2"]);
    expect(channelSpy).toHaveBeenCalledTimes(1); // still just the one subscription
  });

  it("loading older history preserves already-known reactions and fetches only the newly loaded ids", async () => {
    queue = [
      { rows: [{ messageId: "m5", userId: "u2", emoji: "🙏" }] }, // initial mount fetch
      { rows: [{ messageId: "m5", userId: "u2", emoji: "🙏" }] }, // catch-up on the first SUBSCRIBED confirmation
      { rows: [{ messageId: "m1", userId: "u1", emoji: "😮" }] }, // incremental fetch for the older message
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
    expect(fetchReactionsSpy).toHaveBeenCalledTimes(3);
    expect(fetchReactionsSpy).toHaveBeenNthCalledWith(3, "t1", ["m1"]);
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
      { rows: [{ messageId: "m1", userId: "u1", emoji: "❤️" }] }, // initial mount fetch
      { rows: [{ messageId: "m1", userId: "u1", emoji: "❤️" }] }, // catch-up on the first SUBSCRIBED confirmation
      { rows: [{ messageId: "m1", userId: "u2", emoji: "👍" }] }, // catch-up on the manual reconnect below
    ];
    const { result } = renderHook(() => useDMReactions("t1", "u1", ["m1"]));
    await waitFor(() => expect(result.current.reactions).toEqual([{ messageId: "m1", userId: "u1", emoji: "❤️" }]));
    expect(fetchReactionsSpy).toHaveBeenCalledTimes(2);
    const channel = currentChannel();

    act(() => channel._status("TIMED_OUT"));
    expect(result.current.error).toBe(true);

    await act(async () => channel._status("SUBSCRIBED")); // Supabase's own automatic reconnect of the SAME channel
    await waitFor(() => expect(result.current.reactions).toEqual([{ messageId: "m1", userId: "u2", emoji: "👍" }]));
    expect(result.current.error).toBe(false);
    expect(fetchReactionsSpy).toHaveBeenCalledTimes(3);
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

  // --- Three confirmed reaction-sync bugs ---------------------------------

  it("BUG A: a stale thread's request settling cannot unlock a new thread's fetch queue", async () => {
    const { result, rerender } = renderHook(({ tid }: { tid: string }) => useDMReactions(tid, "u1", ["m1"]), {
      initialProps: { tid: "tA" },
    });
    await waitFor(() => expect(pending).toHaveLength(1));
    const staleA = pending[0]; // thread A's initial fetch, in flight

    rerender({ tid: "tB" }); // navigate to thread B while A's fetch is still in flight
    await waitFor(() => expect(pending).toHaveLength(2));
    const bFetch = pending[1]; // B's own initial fetch, now in flight and holding the lock

    // A's stale fetch finally settles WHILE B's fetch is still genuinely in
    // flight. Buggy behavior: A's `finally` clears isFetchingRef
    // unconditionally, before checking whose request this even still is —
    // incorrectly "unlocking" B's queue.
    await act(async () => {
      staleA.resolve([{ messageId: "m1", userId: "u1", emoji: "❤️" }]);
    });

    // A realtime event for B arrives right now, while bFetch is still
    // unsettled. Correct: this must queue behind bFetch, not race it — if
    // the stale completion above wrongly unlocked the queue, this would
    // instead start a second, unserialized concurrent request immediately.
    act(() => {
      currentChannel()._fire("dm_reactions");
    });
    expect(pending).toHaveLength(2); // still just A's (irrelevant) + B's in-flight fetch — nothing new started

    await act(async () => {
      bFetch.resolve([{ messageId: "m1", userId: "u2", emoji: "👍" }]);
    });
    // Only NOW does the queued realtime-triggered refresh actually run —
    // serialized after bFetch, not concurrent with it.
    await waitFor(() => expect(pending).toHaveLength(3));
    await act(async () => {
      pending[2].resolve([{ messageId: "m1", userId: "u2", emoji: "👍" }]);
    });
    await waitFor(() => expect(result.current.reactions).toEqual([{ messageId: "m1", userId: "u2", emoji: "👍" }]));
  });

  it("BUG A: also holds across an account change (same or different thread)", async () => {
    const { result, rerender } = renderHook(
      ({ tid, uid }: { tid: string; uid: string }) => useDMReactions(tid, uid, ["m1"]),
      { initialProps: { tid: "t1", uid: "userA" } }
    );
    await waitFor(() => expect(pending).toHaveLength(1));
    const staleAccountA = pending[0];

    rerender({ tid: "t1", uid: "userB" }); // switch accounts, same thread id
    await waitFor(() => expect(pending).toHaveLength(2));
    const accountBFetch = pending[1];

    await act(async () => {
      staleAccountA.resolve([{ messageId: "m1", userId: "userA", emoji: "❤️" }]);
    });
    act(() => {
      currentChannel()._fire("dm_reactions");
    });
    expect(pending).toHaveLength(2); // queued behind accountBFetch, not raced

    await act(async () => {
      accountBFetch.resolve([{ messageId: "m1", userId: "userB", emoji: "👍" }]);
    });
    await waitFor(() => expect(pending).toHaveLength(3));
    await act(async () => {
      pending[2].resolve([{ messageId: "m1", userId: "userB", emoji: "👍" }]);
    });
    await waitFor(() => expect(result.current.reactions).toEqual([{ messageId: "m1", userId: "userB", emoji: "👍" }]));
  });

  it("BUG FIX: a reaction changing during retry's OWN snapshot-to-subscription gap (not just mount's) is still caught up", async () => {
    // Mount settles normally first.
    queue = [
      { rows: [{ messageId: "m1", userId: "u1", emoji: "❤️" }] },
      { rows: [{ messageId: "m1", userId: "u1", emoji: "❤️" }] },
    ];
    const { result } = renderHook(() => useDMReactions("t1", "u1", ["m1"]));
    await waitFor(() => expect(result.current.reactions).toEqual([{ messageId: "m1", userId: "u1", emoji: "❤️" }]));
    expect(fetchReactionsSpy).toHaveBeenCalledTimes(2);

    // From here on, any NEW channel (retry tears down the old one and
    // creates a fresh one) does not auto-confirm — full manual control
    // over exactly when ITS first SUBSCRIBED lands, independent of
    // retry's own top-of-effect fetch.
    deferSubscribeConfirmation = true;
    queue = [{ rows: [{ messageId: "m1", userId: "u1", emoji: "❤️" }] }]; // retry's own snapshot — stale, unchanged
    act(() => {
      result.current.retry();
    });
    await waitFor(() => expect(fetchReactionsSpy).toHaveBeenCalledTimes(3)); // retry's top-of-effect fetch has resolved
    expect(result.current.reactions).toEqual([{ messageId: "m1", userId: "u1", emoji: "❤️" }]);

    // The reaction changes in the exact gap between THAT snapshot and the
    // new channel's own subscription actually confirming.
    queue = [{ rows: [{ messageId: "m1", userId: "u2", emoji: "👍" }] }];

    // The new channel confirms for the first time now — no dm_reactions
    // postgres_changes event ever fires; only this SUBSCRIBED confirmation
    // itself should catch it up. Without the fix, a retry-created
    // channel's first confirmation was skipped as "redundant" with the
    // top-of-effect fetch, which by definition can't see a change that
    // happens AFTER it already ran — this reaction would stay stuck at
    // ❤️ forever.
    await act(async () => {
      currentChannel()._status("SUBSCRIBED");
    });
    await waitFor(() => expect(result.current.reactions).toEqual([{ messageId: "m1", userId: "u2", emoji: "👍" }]));
    expect(fetchReactionsSpy).toHaveBeenCalledTimes(4);
  });

  it("BUG B: a reaction changing after the initial snapshot but before the first subscription confirmation is not missed", async () => {
    deferSubscribeConfirmation = true;
    queue = [{ rows: [{ messageId: "m1", userId: "u1", emoji: "❤️" }] }]; // initial HTTP snapshot
    const { result } = renderHook(() => useDMReactions("t1", "u1", ["m1"]));
    await waitFor(() => expect(result.current.reactions).toEqual([{ messageId: "m1", userId: "u1", emoji: "❤️" }]));
    expect(fetchReactionsSpy).toHaveBeenCalledTimes(1); // only the snapshot — subscription not confirmed yet

    // The reaction changes in that exact gap. No postgres_changes event can
    // possibly have been delivered for it — the subscription itself isn't
    // confirmed live yet, so nothing re-delivers a change from before it is.
    queue = [{ rows: [{ messageId: "m1", userId: "u2", emoji: "👍" }] }];

    // The subscription confirms for the very first time now — well after
    // the snapshot was taken, and with NO dm_reactions event ever firing.
    await act(async () => {
      currentChannel()._status("SUBSCRIBED");
    });
    await waitFor(() => expect(result.current.reactions).toEqual([{ messageId: "m1", userId: "u2", emoji: "👍" }]));
    expect(fetchReactionsSpy).toHaveBeenCalledTimes(2);
  });

  it("BUG C: a successful fetch for one message cannot mask an unresolved failure for another", async () => {
    // Mount settles normally (initial fetch + the bug-B catch-up on first SUBSCRIBED).
    queue = [
      { rows: [{ messageId: "m1", userId: "u1", emoji: "❤️" }] },
      { rows: [{ messageId: "m1", userId: "u1", emoji: "❤️" }] },
      "throw", // message "b"'s fetch below fails
    ];
    const { result, rerender } = renderHook(({ ids }: { ids: string[] }) => useDMReactions("t1", "u1", ids), {
      initialProps: { ids: ["m1"] },
    });
    await waitFor(() => expect(result.current.reactions).toEqual([{ messageId: "m1", userId: "u1", emoji: "❤️" }]));
    expect(fetchReactionsSpy).toHaveBeenCalledTimes(2);

    // Message "b" loads and its fetch fails.
    rerender({ ids: ["m1", "b"] });
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(fetchReactionsSpy).toHaveBeenCalledTimes(3);

    // A later, unrelated message "c" loads and its fetch succeeds.
    queue = [{ rows: [{ messageId: "c", userId: "u1", emoji: "😮" }] }];
    rerender({ ids: ["m1", "b", "c"] });
    await waitFor(() =>
      expect(result.current.reactions).toEqual(
        expect.arrayContaining([
          { messageId: "m1", userId: "u1", emoji: "❤️" },
          { messageId: "c", userId: "u1", emoji: "😮" },
        ])
      )
    );
    // "b" is still unresolved — c's success must not clear the error.
    expect(result.current.error).toBe(true);

    // retry() — with no realtime event involved — re-fetches everything
    // known, including "b", and this time it succeeds.
    queue = [
      {
        rows: [
          { messageId: "m1", userId: "u1", emoji: "❤️" },
          { messageId: "b", userId: "u1", emoji: "🙏" },
          { messageId: "c", userId: "u1", emoji: "😮" },
        ],
      },
    ];
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.error).toBe(false));
    expect(result.current.reactions).toEqual(
      expect.arrayContaining([
        { messageId: "m1", userId: "u1", emoji: "❤️" },
        { messageId: "b", userId: "u1", emoji: "🙏" },
        { messageId: "c", userId: "u1", emoji: "😮" },
      ])
    );
    expect(result.current.reactions).toHaveLength(3);
  });
});
