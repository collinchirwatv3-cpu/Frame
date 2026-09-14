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
  // Ids that are "known" (in knownIdsRef) but whose most recent fetch
  // attempt failed and hasn't since been superseded by a successful one —
  // distinct from knownIdsRef itself, which only ever grows and says
  // nothing about whether a given id's data actually arrived. Drives
  // `fetchError` so an unrelated scope's success (e.g. an incremental
  // fetch for a newly-loaded message C) can never mask an id (B) that's
  // still genuinely missing its data.
  const failedIdsRef = useRef<Set<string>>(new Set());
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
    failedIdsRef.current = new Set();
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
        // Only the ids actually covered by THIS fetch can be considered
        // resolved — an unrelated id that failed on some earlier attempt
        // and hasn't been retried yet must keep `fetchError` true even
        // though this fetch, for a different scope, succeeded.
        for (const id of scope) failedIdsRef.current.delete(id);
        setState((prev) =>
          prev.identity === identity
            ? { ...prev, rows: mergeReactions(prev.rows, scope, rows), fetchError: failedIdsRef.current.size > 0 }
            : prev
        );
      }
    } catch {
      // Last-known-good rows are preserved — only the error flag changes.
      if (epochRef.current === myEpoch) {
        for (const id of scope) failedIdsRef.current.add(id);
        setState((prev) => (prev.identity === identity ? { ...prev, fetchError: true } : prev));
      }
    } finally {
      // Only the request that still OWNS the current identity's lock may
      // release it or dispatch queued follow-up work. A request for an
      // identity that's since been navigated away from can settle at any
      // time — without this guard it would unconditionally clear
      // isFetchingRef here, which (if a genuinely current fetch for the
      // NEW identity happens to be in flight at that exact moment) frees
      // the lock out from under it and lets a second, unserialized fetch
      // start concurrently for the identity that's actually active.
      if (epochRef.current === myEpoch) {
        isFetchingRef.current = false;
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
  // an explicit retry(), and every SUBSCRIBED confirmation (the first one
  // included — see the comment below) whether that's the initial
  // confirmation or Supabase's own automatic reconnect after a dropped
  // connection. Deliberately excludes messageIds/messageKey from its
  // dependencies — receiving a message or loading older history must
  // never tear down and recreate this subscription.
  useEffect(() => {
    if (!userId) return;
    const myEpoch = epochRef.current;

    // Every pass through this effect explicitly refreshes everything known,
    // independent of realtime — except literally the first pass for this
    // identity (mount), where the messageIds effect already owns the
    // initial load and a duplicate fetch here would just race it for no
    // reason.
    const isMountPass = skipInitialRetryFetchRef.current;
    if (isMountPass) {
      skipInitialRetryFetchRef.current = false;
    } else if (knownIdsRef.current.size > 0) {
      // Not the first pass for this identity — a retry() bump. Refresh
      // everything already known, independent of the subscription below.
      scheduleFetch([], true, threadId, myEpoch);
    }

    // True once this effect's OWN channel instance has confirmed SUBSCRIBED
    // at least once — distinct from isMountPass, which is about the EFFECT
    // pass, not the channel. Resets to false every time this effect (re)runs
    // with a fresh channel; a later SUBSCRIBED on that same instance is
    // Supabase's own automatic reconnect after a drop, not a first
    // confirmation.
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
          // The initial HTTP snapshot (the messageIds effect) and this
          // confirmation are two independent async operations that race —
          // a reaction can change in the gap between the snapshot actually
          // being taken and the subscription actually going live, and
          // nothing re-delivers a change that happened before a Postgres
          // Changes subscription was confirmed. A catch-up here closes that
          // gap — needed on the very first confirmation of a mount (nothing
          // else covers it there) and on every later reconnect of this same
          // channel instance (ditto). It's redundant only when this is the
          // first confirmation of a NON-mount pass (a retry() bump): the
          // top-of-effect branch above just did the exact same full refresh
          // moments ago for that case, so firing again here would be a
          // pointless duplicate request racing its own queue. Routed
          // through the existing fetch queue (scheduleFetch) regardless, so
          // this can never race the initial HTTP load or any other
          // in-flight fetch — it just queues behind it.
          if ((subscribedBefore || isMountPass) && knownIdsRef.current.size > 0) {
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
