"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchReactions, type DMReaction } from "./dm-reactions";

/** Replaces every row for a message id in `scopeIds` with whatever `fresh`
 * says about it (nothing, if `fresh` has no row for that id — a real
 * removal), while leaving rows for every OTHER message id untouched. This
 * is what lets a fetch scoped to just a few ids (a realtime refresh of
 * everything known, or an incremental pull for newly-loaded messages)
 * update state without clobbering reactions for ids outside that scope. */
function mergeReactions(prev: DMReaction[], scopeIds: Set<string>, fresh: DMReaction[]): DMReaction[] {
  const kept = prev.filter((r) => !scopeIds.has(r.messageId));
  return [...kept, ...fresh];
}

/** Reactions have their own refresh path: an old message changing must
 * never advance the message sync/read cursor or reorder the thread list.
 *
 * Identity here is thread+user ONLY — never the message id list. The
 * message list only grows (new arrivals, older history pages) and must
 * never itself reset already-loaded reactions or tear down/recreate the
 * realtime subscription; a separate effect below diffs it against what's
 * already known and fetches just the delta. Loading over HTTP is also
 * fully independent of the realtime subscription's own status: it starts
 * regardless of whether/when (or if ever) the channel confirms SUBSCRIBED,
 * and a degraded (errored/timed-out) subscription is surfaced rather than
 * silently leaving reactions stale with no indication anything is wrong.
 */
export function useDMReactions(threadId: string, userId: string | null, messageIds: string[]) {
  const identity = `${threadId}:${userId ?? ""}`;
  const [state, setState] = useState<{ identity: string; rows: DMReaction[]; fetchError: boolean; realtimeDegraded: boolean }>(
    () => ({ identity, rows: [], fetchError: false, realtimeDegraded: false })
  );

  // React's own "adjusting state when a prop changes" pattern (mirrors
  // DMThreadPage) — resets state tied to the OLD thread/user the instant
  // identity changes, in the same render pass, before any stale-identity
  // async work could resolve and race a fresh render.
  if (state.identity !== identity) {
    setState({ identity, rows: [], fetchError: false, realtimeDegraded: false });
  }

  const [revision, setRevision] = useState(0);
  const retry = useCallback(() => setRevision((n) => n + 1), []);

  // Refs tied to the CURRENT identity, reset via the layout effect below
  // whenever identity changes — before any pending microtask from
  // in-flight work for the OLD identity gets a chance to run.
  const epochRef = useRef(0);
  const knownIdsRef = useRef<Set<string>>(new Set());
  const isFetchingRef = useRef(false);
  const pendingFullRef = useRef(false);
  const pendingNewIdsRef = useRef<Set<string>>(new Set());
  // True only on this identity's very first pass through the
  // subscribe/realtime effect — the messageIds effect below owns the
  // INITIAL load, so that first pass must not also fetch (a duplicate
  // request racing the same data). Every later pass (a retry() bump)
  // means the caller explicitly wants a fresh pull independent of
  // realtime.
  const skipInitialRetryFetchRef = useRef(true);

  useLayoutEffect(() => {
    epochRef.current += 1;
    knownIdsRef.current = new Set();
    isFetchingRef.current = false;
    pendingFullRef.current = false;
    pendingNewIdsRef.current = new Set();
    skipInitialRetryFetchRef.current = true;
  }, [identity]);

  // Always holds the latest messageIds prop without making the effects
  // below depend on array identity (a new array reference every render,
  // e.g. `messages.map(m => m.id)` at the call site, would otherwise
  // re-run them every render for no reason).
  const messageIdsRef = useRef(messageIds);
  useEffect(() => {
    messageIdsRef.current = messageIds;
  });
  const messageKey = messageIds.join(",");

  // Recursion (the finally block below, dispatching a queued follow-up
  // pass) goes through this ref rather than calling `runFetch` by name —
  // the React Compiler can't verify a useCallback body is safe to
  // memoize when it calls itself directly. Correctness doesn't depend on
  // which render's closure ends up running the follow-up: fetchThreadId
  // and myEpoch are passed explicitly down the chain and rechecked
  // against epochRef on every step, so a "stale" closure is harmless —
  // this indirection exists purely to satisfy the compiler, matching the
  // same refreshRef pattern DMThreadPage uses for its own recursive
  // follow-up dispatch.
  const runFetchRef = useRef<(ids: string[], fetchThreadId: string, myEpoch: number) => Promise<void>>(() => Promise.resolve());

  const runFetch = useCallback(async (ids: string[], fetchThreadId: string, myEpoch: number) => {
    if (ids.length === 0) return;
    isFetchingRef.current = true;
    const scope = new Set(ids);
    try {
      const rows = await fetchReactions(fetchThreadId, ids);
      if (epochRef.current === myEpoch) {
        setState((prev) => (prev.identity === identity ? { ...prev, rows: mergeReactions(prev.rows, scope, rows), fetchError: false } : prev));
      }
    } catch {
      // Last-known-good rows are preserved — only the error flag changes.
      if (epochRef.current === myEpoch) {
        setState((prev) => (prev.identity === identity ? { ...prev, fetchError: true } : prev));
      }
    } finally {
      isFetchingRef.current = false;
      if (epochRef.current === myEpoch) {
        if (pendingFullRef.current) {
          pendingFullRef.current = false;
          pendingNewIdsRef.current.clear();
          void runFetchRef.current(Array.from(knownIdsRef.current), fetchThreadId, myEpoch);
        } else if (pendingNewIdsRef.current.size > 0) {
          const next = Array.from(pendingNewIdsRef.current);
          pendingNewIdsRef.current.clear();
          void runFetchRef.current(next, fetchThreadId, myEpoch);
        }
      }
    }
  }, [identity]);
  useLayoutEffect(() => {
    runFetchRef.current = runFetch;
  }, [runFetch]);

  // Serializes fetches so an overlapping trigger (a realtime event landing
  // mid-fetch, a retry while new messages are also being pulled in) never
  // starts a second request racing the first — it just queues one more
  // pass to run immediately after the current one finishes.
  const scheduleFetch = useCallback((ids: string[], full: boolean, fetchThreadId: string, myEpoch: number) => {
    if (isFetchingRef.current) {
      if (full) pendingFullRef.current = true;
      else for (const id of ids) pendingNewIdsRef.current.add(id);
      return;
    }
    void runFetch(full ? Array.from(knownIdsRef.current) : ids, fetchThreadId, myEpoch);
  }, [runFetch]);

  // Owns the INITIAL load and every incremental pull as the message list
  // grows (new arrivals, older history pages) — entirely over HTTP,
  // independent of realtime subscription status. Never resets `rows`: it
  // only ever fetches ids it hasn't seen before and merges them in,
  // leaving everything already known untouched.
  useEffect(() => {
    if (!userId) return;
    const myEpoch = epochRef.current;
    const currentIds = messageIdsRef.current;
    const newIds = currentIds.filter((id) => !knownIdsRef.current.has(id));
    if (newIds.length === 0) return;
    for (const id of newIds) knownIdsRef.current.add(id);
    scheduleFetch(newIds, false, threadId, myEpoch);
  }, [threadId, userId, messageKey, scheduleFetch]);

  // Owns the realtime subscription and everything that should trigger a
  // full refresh of everything already known: a live dm_reactions change,
  // an explicit retry(), and Supabase's own automatic reconnect after a
  // dropped connection. Deliberately excludes messageIds/messageKey from
  // its dependencies — receiving a message or loading older history must
  // never tear down and recreate this subscription.
  useEffect(() => {
    if (!userId) return;
    const myEpoch = epochRef.current;

    if (skipInitialRetryFetchRef.current) {
      skipInitialRetryFetchRef.current = false;
    } else if (knownIdsRef.current.size > 0) {
      // Not the first pass for this identity — a retry() bump. Refresh
      // everything already known, independent of the subscription below.
      scheduleFetch([], true, threadId, myEpoch);
    }

    let subscribedBefore = false;
    const client = createClient();
    const channel = client
      .channel(`dm-reactions:${threadId}:${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "dm_reactions", filter: `thread_id=eq.${threadId}` }, () => {
        if (epochRef.current !== myEpoch) return;
        if (knownIdsRef.current.size > 0) scheduleFetch([], true, threadId, myEpoch);
      })
      .subscribe((status) => {
        if (epochRef.current !== myEpoch) return;
        if (status === "SUBSCRIBED") {
          setState((prev) => (prev.identity === identity ? { ...prev, realtimeDegraded: false } : prev));
          // A resubscribe of this SAME channel instance — Supabase's own
          // automatic reconnect after a drop, not this effect's first
          // confirmation — may have missed events while disconnected.
          if (subscribedBefore && knownIdsRef.current.size > 0) {
            scheduleFetch([], true, threadId, myEpoch);
          }
          subscribedBefore = true;
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setState((prev) => (prev.identity === identity ? { ...prev, realtimeDegraded: true } : prev));
        }
      });

    return () => {
      void client.removeChannel(channel);
    };
  }, [threadId, userId, revision, identity, scheduleFetch]);

  return {
    reactions: state.identity === identity ? state.rows : [],
    error: state.identity === identity && (state.fetchError || state.realtimeDegraded),
    retry,
  };
}
