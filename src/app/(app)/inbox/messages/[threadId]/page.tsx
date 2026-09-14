"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Send } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { cn, formatRelativeTime } from "@/lib/utils";
import {
  fetchThread,
  fetchMessages,
  sendMessage,
  markThreadRead,
  type DMThread,
  type DMMessage,
  type MessageCursor,
} from "@/lib/dm";
import { useDMRealtime } from "@/lib/use-dm-realtime";
import { useCurrentUserStore } from "@/store/current-user-store";

const MESSAGE_PAGE_SIZE = 100;
// A real safety valve, not an expected ceiling: at 100 messages/page this
// is 5000 messages caught up in one pass before pausing and asking for an
// explicit "Continue syncing" tap — a truly endless live stream mid-drain
// is not a realistic case for a 1:1 DM, but an unbounded loop has no place
// here regardless. Hitting the cap is handled the same way a genuine
// fetch failure is: syncIncomplete, resumable, never silently dropped.
const MAX_DRAIN_PAGES = 50;

function cursorOf(message: DMMessage): MessageCursor {
  return { createdAt: message.createdAt, id: message.id };
}

/** Deterministic chronological merge, not append-and-hope: an "after"
 * batch that finally retrieves a message chronologically EARLIER than
 * something already displayed (a delayed message B fetched only after a
 * later message C — from anyone, including this client's own optimistic
 * send — already landed) must be inserted in the right position, not
 * tacked onto the end out of order. Dedupes by id first, since realtime
 * delivery and a sender's own optimistic append can otherwise double up a
 * row the drain later re-fetches. */
function mergeAndSort(existing: DMMessage[], incoming: DMMessage[]): DMMessage[] {
  if (incoming.length === 0) return existing;
  const knownIds = new Set(existing.map((m) => m.id));
  const fresh = incoming.filter((m) => !knownIds.has(m.id));
  if (fresh.length === 0) return existing;
  return [...existing, ...fresh].sort((a, b) => {
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

function ThreadSkeleton() {
  return (
    <div className="flex flex-col gap-3 px-6 pt-4">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className={cn("h-10 rounded-2xl", i % 2 ? "w-2/3 ml-auto" : "w-1/2")} />
      ))}
    </div>
  );
}

/**
 * A 1:1 conversation — text only, no edit/unsend/typing-indicator in this
 * pass.
 *
 * The core correctness property this file exists to maintain: what's
 * DISPLAYED (`messages` state) and what's genuinely been SYNCED FROM THE
 * SERVER (`syncCursorRef`) are two different things, tracked separately.
 * A successful send appends to `messages` immediately (for responsive
 * UI) but must NEVER move the sync cursor — otherwise an earlier message
 * from the other participant that hasn't loaded yet becomes permanently
 * unreachable the moment the sync cursor jumps past it (every future
 * "after" fetch would only ever look newer than the send, never catch the
 * earlier gap). The sync cursor only ever advances as a real "after" fetch
 * succeeds, and it — not the display list — is what markThreadRead
 * acknowledges against, so a message that arrives after the last fetch but
 * before an ack call can never be falsely marked read.
 *
 * refresh() is serialized (never runs concurrently with itself) and every
 * async step checks an "epoch" token bumped whenever threadId/userId
 * change, so in-flight work for a thread the user has since navigated away
 * from can never apply its results to the new thread's state.
 */
export default function DMThreadPage() {
  const { threadId } = useParams<{ threadId: string }>();
  const router = useRouter();
  const userId = useCurrentUserStore((s) => s.profile?.id ?? null);

  const [thread, setThread] = useState<DMThread | null>(null);
  const [messages, setMessages] = useState<DMMessage[]>([]);
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loadOlderError, setLoadOlderError] = useState(false);
  // True once a drain pass ends without fully catching up (a fetch failed
  // partway, or MAX_DRAIN_PAGES was hit) — messages already loaded stay on
  // screen either way; this only drives the "some messages may be missing"
  // retry affordance.
  const [syncIncomplete, setSyncIncomplete] = useState(false);
  const [syncRetrying, setSyncRetrying] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Fetch-validated sync progress — see the file-level comment. null means
  // "never successfully synced for this thread in this component instance
  // yet," which is what selects the initial full-page-fetch path below
  // rather than an incremental "after" drain.
  const syncCursorRef = useRef<MessageCursor | null>(null);
  // Bumped whenever the thread/user identity changes; every async
  // continuation checks it before touching state, so work started for a
  // thread the user has since left can't corrupt the new thread's state.
  const epochRef = useRef(0);
  // Serializes refresh() — a second trigger arriving while one is already
  // running never starts a concurrent, independently-racing drain; it just
  // flags one more pass to run immediately after the current one finishes.
  // This is what makes "coordinate overlapping refreshes" true by
  // construction rather than by detecting and discarding stale responses.
  const isRefreshingRef = useRef(false);
  const pendingRefreshRef = useRef(false);
  // Always holds the CURRENT render's `refresh` — see the comment where
  // it's assigned, right after `refresh` is declared.
  const refreshRef = useRef<() => void>(() => {});

  // Set right before any setMessages() call that APPENDS (initial load, a
  // newly-arrived/sent message) — never before loadOlder()'s prepend, which
  // handles its own scroll-position preservation instead. Consumed (reset
  // to false) the moment the effect below actually scrolls, so a render
  // that didn't request it (loadOlder's own state update) never snaps the
  // view back to the bottom out from under the reader.
  const shouldScrollToBottomRef = useRef(true);

  const runRefresh = useCallback(async () => {
    const myEpoch = epochRef.current;
    if (!userId) return;

    const threadResult = await fetchThread(threadId, userId);
    if (epochRef.current !== myEpoch) return;
    if (!threadResult) {
      setStatus("error");
      return;
    }
    setThread(threadResult);

    if (syncCursorRef.current === null) {
      let latest: DMMessage[];
      try {
        latest = await fetchMessages(threadId);
      } catch {
        if (epochRef.current === myEpoch) setStatus("error");
        return;
      }
      if (epochRef.current !== myEpoch) return;
      shouldScrollToBottomRef.current = true;
      setMessages(latest);
      setHasMoreOlder(latest.length === MESSAGE_PAGE_SIZE);
      setStatus("ready");
      setSyncIncomplete(false);
      if (latest.length > 0) {
        const cursor = cursorOf(latest[latest.length - 1]);
        syncCursorRef.current = cursor;
        markThreadRead(threadId, cursor);
      }
      return;
    }

    // Drains from the confirmed sync cursor — never from anything derived
    // from `messages`, which can already include an optimistically-
    // appended own-send chronologically ahead of something not yet synced.
    let cursor = syncCursorRef.current;
    let caughtUp = false;
    let drainFailed = false;
    for (let page = 0; page < MAX_DRAIN_PAGES; page++) {
      let batch: DMMessage[];
      try {
        batch = await fetchMessages(threadId, { after: cursor });
      } catch {
        drainFailed = true;
        break;
      }
      if (epochRef.current !== myEpoch) return;
      if (batch.length === 0) {
        caughtUp = true;
        break;
      }
      shouldScrollToBottomRef.current = true;
      setMessages((prev) => mergeAndSort(prev, batch));
      cursor = cursorOf(batch[batch.length - 1]);
      syncCursorRef.current = cursor;
      // Acknowledged per successfully-fetched page, not just once at the
      // very end — if a later page in this same drain fails, whatever WAS
      // already fetched stays correctly marked read rather than the whole
      // pass being all-or-nothing.
      markThreadRead(threadId, cursor);
      if (batch.length < MESSAGE_PAGE_SIZE) {
        caughtUp = true;
        break;
      }
    }

    if (epochRef.current !== myEpoch) return;
    setStatus("ready");
    setSyncIncomplete(drainFailed || !caughtUp);
  }, [threadId, userId]);

  const refresh = useCallback(async () => {
    if (isRefreshingRef.current) {
      pendingRefreshRef.current = true;
      return;
    }
    isRefreshingRef.current = true;
    try {
      await runRefresh();
    } finally {
      isRefreshingRef.current = false;
      if (pendingRefreshRef.current) {
        pendingRefreshRef.current = false;
        // Deliberately NOT a recursive call to this closure's own `refresh`
        // identifier: if the thread/user changed while this pass was in
        // flight, `refresh` here is permanently bound to the OLD identity
        // (whatever runRefresh looked like when THIS closure was created),
        // and recursing into it would re-run a stale fetch that carries a
        // now-current-looking epoch snapshot — silently resurrecting the
        // old thread's data after a real one already loaded. Going through
        // the ref instead always dispatches to whichever identity is
        // current at the moment the follow-up actually fires.
        refreshRef.current();
      }
    }
  }, [runRefresh]);
  // Refs can't be written during render (below), so the recursive
  // follow-up dispatch above goes through this instead — kept current via
  // a layout effect, which (like the identity-reset layout effect below)
  // still commits before any pending microtask from an in-flight fetch
  // gets a chance to run.
  useLayoutEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  // React's own "adjusting state when a prop changes" pattern (a plain
  // conditional in the render body, not an effect) — resets STATE tied to
  // the OLD thread/user the instant threadId/userId changes, in the same
  // render pass, before any stale-epoch async work could resolve and race
  // a fresh render. The actual data fetch for the new identity is kicked
  // off separately below (state resets can't themselves start async work
  // during render).
  const identityKey = `${threadId}:${userId ?? ""}`;
  const [trackedIdentityKey, setTrackedIdentityKey] = useState(identityKey);
  if (identityKey !== trackedIdentityKey) {
    setTrackedIdentityKey(identityKey);
    setThread(null);
    setMessages([]);
    setStatus("loading");
    setHasMoreOlder(false);
    setLoadOlderError(false);
    setSyncIncomplete(false);
  }

  // The two ref resets tied to the same identity change can't live in the
  // render body above (refs can't be read/written during render) — a
  // layout effect keyed on identityKey is the closest equivalent: it still
  // commits synchronously, before paint and before any pending microtask
  // from an in-flight fetch for the OLD identity gets a chance to run, so
  // a stale result still can never resolve in the gap between the state
  // reset above committing and these refs actually updating. Also runs on
  // mount (bumping epoch 0 -> 1 before the very first refresh() call
  // reads it) — harmless, nothing depends on the epoch's literal value.
  useLayoutEffect(() => {
    epochRef.current += 1;
    syncCursorRef.current = null;
  }, [identityKey]);

  // Fires on mount and whenever threadId/userId change (refresh's own
  // identity changes exactly then, via runRefresh's dependency array) —
  // this is what actually (re)starts syncing for a newly-navigated-to
  // thread; useDMRealtime's own mount-time trigger below covers the
  // "already on this thread, a live change just happened" case instead.
  useEffect(() => {
    refresh();
  }, [refresh]);

  useDMRealtime(userId, refresh);

  useEffect(() => {
    if (!shouldScrollToBottomRef.current) return;
    shouldScrollToBottomRef.current = false;
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  async function retrySync() {
    if (syncRetrying) return;
    setSyncRetrying(true);
    try {
      await refresh();
    } finally {
      setSyncRetrying(false);
    }
  }

  async function loadOlder() {
    if (loadingOlder || !hasMoreOlder || messages.length === 0) return;
    const myEpoch = epochRef.current;
    setLoadingOlder(true);
    setLoadOlderError(false);
    const container = scrollContainerRef.current;
    const previousScrollHeight = container?.scrollHeight ?? 0;

    let older: DMMessage[];
    try {
      older = await fetchMessages(threadId, { before: cursorOf(messages[0]) });
    } catch {
      if (epochRef.current === myEpoch) {
        setLoadOlderError(true);
        setLoadingOlder(false);
      }
      return;
    }
    if (epochRef.current !== myEpoch) return;

    shouldScrollToBottomRef.current = false;
    setMessages((prev) => {
      const knownIds = new Set(prev.map((m) => m.id));
      const fresh = older.filter((m) => !knownIds.has(m.id));
      return [...fresh, ...prev];
    });
    setHasMoreOlder(older.length === MESSAGE_PAGE_SIZE);
    setLoadingOlder(false);

    // Preserve the reader's visual position — prepending above the
    // viewport otherwise yanks the scroll position down to match the new
    // (taller) content.
    requestAnimationFrame(() => {
      if (!container) return;
      container.scrollTop += container.scrollHeight - previousScrollHeight;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    const myEpoch = epochRef.current;
    setSending(true);
    setSendError(false);
    try {
      const sent = await sendMessage(threadId, text);
      if (epochRef.current !== myEpoch) return;
      if (sent) {
        setDraft("");
        shouldScrollToBottomRef.current = true;
        // Intentionally does NOT touch syncCursorRef — an optimistic
        // append is not a synced fetch (see the file-level comment); the
        // next drain will pick this exact message back up (and dedupe it
        // via mergeAndSort) alongside anything else that landed first.
        setMessages((prev) => mergeAndSort(prev, [sent]));
      } else {
        setSendError(true);
        window.setTimeout(() => setSendError(false), 2400);
      }
    } catch {
      // sendMessage itself never throws (it catches network failures
      // internally) — this is a backstop against an unexpected exception
      // from anywhere else in this block, so the button can't get stuck
      // disabled AND so this doesn't surface as an unhandled rejection the
      // way a bare `finally` (with no `catch`) would: `finally` runs
      // cleanup but still re-throws, `catch` actually stops it here.
      if (epochRef.current === myEpoch) {
        setSendError(true);
        window.setTimeout(() => setSendError(false), 2400);
      }
    } finally {
      if (epochRef.current === myEpoch) setSending(false);
    }
  }

  const canMessage = !thread?.otherUserUnavailable;

  return (
    <div className="h-dvh flex flex-col">
      <div className="flex items-center gap-3 px-4 pt-8 pb-3 border-b border-border shrink-0">
        <button
          onClick={() => router.back()}
          aria-label="Back"
          className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-card transition-colors shrink-0"
        >
          <ArrowLeft size={18} />
        </button>
        {thread &&
          (canMessage ? (
            <Link href={`/profile/${thread.otherUser.username}`} className="flex items-center gap-2.5 min-w-0">
              <Avatar src={thread.otherUser.avatarUrl} alt={thread.otherUser.displayName} size={32} />
              <p className="text-sm font-semibold truncate">{thread.otherUser.displayName}</p>
            </Link>
          ) : (
            <div className="flex items-center gap-2.5 min-w-0">
              <Avatar src="" alt="Unavailable" size={32} />
              <p className="text-sm font-semibold truncate text-text-secondary">Unavailable</p>
            </div>
          ))}
      </div>

      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
        {status === "loading" ? (
          <ThreadSkeleton />
        ) : status === "error" ? (
          <div className="flex items-center justify-center h-full">
            <ErrorState onRetry={refresh} heading="Couldn't load this conversation" />
          </div>
        ) : messages.length === 0 ? (
          <p className="text-center text-xs text-text-secondary py-10">
            Say hello to {thread?.otherUser.displayName}.
          </p>
        ) : (
          <div className="flex flex-col gap-2 px-4 py-4">
            {hasMoreOlder && (
              <div className="flex flex-col items-center gap-1 mb-1">
                <button
                  onClick={loadOlder}
                  disabled={loadingOlder}
                  className="text-xs font-medium text-text-secondary hover:text-accent transition-colors disabled:opacity-50"
                >
                  {loadingOlder ? "Loading…" : loadOlderError ? "Couldn't load — try again" : "Load earlier messages"}
                </button>
              </div>
            )}
            {messages.map((message) => {
              const own = message.senderId === userId;
              return (
                <div
                  key={message.id}
                  className={cn(
                    "max-w-[75%] px-3.5 py-2 rounded-2xl text-sm",
                    own ? "self-end bg-primary text-bg" : "self-start bg-card"
                  )}
                >
                  <p>{message.text}</p>
                  <p className={cn("text-[10px] mt-1", own ? "text-bg/70" : "text-text-secondary")}>
                    {formatRelativeTime(message.createdAt)}
                  </p>
                </div>
              );
            })}
            {syncIncomplete && (
              <button
                onClick={retrySync}
                disabled={syncRetrying}
                className="self-center mt-1 text-xs font-medium text-primary hover:underline underline-offset-2 disabled:opacity-50"
              >
                {syncRetrying ? "Syncing…" : "Some messages may be missing — Continue syncing"}
              </button>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {status === "ready" && !canMessage ? (
        <p
          className="text-center text-xs text-text-secondary px-4 py-4 border-t border-border shrink-0"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
        >
          You can&apos;t send messages in this conversation.
        </p>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="relative flex items-center gap-2 px-4 py-3 border-t border-border shrink-0"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Message…"
            disabled={status !== "ready"}
            className="flex-1 bg-card border border-border rounded-full px-4 py-2 text-sm outline-none focus:border-primary transition-colors disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!draft.trim() || sending}
            aria-label="Send message"
            className="w-9 h-9 rounded-full bg-primary text-bg flex items-center justify-center disabled:opacity-40 shrink-0"
          >
            <Send size={15} />
          </button>
          {sendError && (
            <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 whitespace-nowrap text-xs font-medium text-primary bg-card px-2.5 py-1 rounded-full">
              Couldn&apos;t send that — try again
            </span>
          )}
        </form>
      )}
    </div>
  );
}
