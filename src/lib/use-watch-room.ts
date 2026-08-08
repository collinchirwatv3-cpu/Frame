"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { createClient } from "@/lib/supabase/client";

type SyncPayload = {
  time: number;
  paused: boolean;
  at: number; // Date.now() when sent — extrapolated forward to cover network latency.
};

type PresenceMeta = { joinedAt: number };

export type Participant = { id: string; joinedAt: number };

export type QueueItem = { id: string; title: string; posterUrl: string; creatorUsername: string };

// Corrections smaller than this are invisible as a stutter; anything bigger
// gets a hard seek rather than trying to smoothly catch up. Exported only
// so use-watch-room.test.ts can reference the real values instead of
// duplicating magic numbers — not otherwise used outside this module.
export const DRIFT_THRESHOLD_SECONDS = 1.5;
export const HEARTBEAT_INTERVAL_MS = 5000;

function applySync(video: HTMLVideoElement, payload: SyncPayload) {
  // Only extrapolate elapsed time when the source was actually playing —
  // a paused broadcast's `time` is exact regardless of how long it took
  // to arrive.
  const elapsed = payload.paused ? 0 : Math.max(0, (Date.now() - payload.at) / 1000);
  const target = payload.time + elapsed;

  if (Math.abs(video.currentTime - target) > DRIFT_THRESHOLD_SECONDS) {
    video.currentTime = target;
  }

  if (payload.paused) video.pause();
  else video.play().catch(() => {});
}

/**
 * Genuinely synced playback + a shared queue for a "watch together" room,
 * built on Supabase Realtime Broadcast + Presence, keyed by roomId.
 *
 * No fixed host — whoever has been in the room longest (earliest tracked
 * presence) is the sync *authority* for playback (play/pause/seek/
 * heartbeat get broadcast only by them; everyone else's <video> is driven
 * by applySync, not local interaction). That falls out for free on
 * disconnect: presence drops their entry, the next-earliest immediately
 * becomes authoritative, no explicit handoff code needed.
 *
 * PRODUCT RULE — host is a sync-authority role, not an authorization
 * boundary: the queue is deliberately collaborative. ANY member can add,
 * remove, reorder, or advance it, not just the host — this was audited
 * once already and the "fix" of making advanceQueue host-only was
 * explicitly rejected as wrong for the product. Do not reintroduce a
 * host-only gate here. Every mutation broadcasts the whole resulting array
 * (`queue-set`) rather than a diff, so there's no ordering dependency
 * between two people editing near-simultaneously — whichever broadcast a
 * client sees last is authoritative for that client, same as how any
 * last-write-wins list would behave.
 *
 * The real boundary is membership, not host status, and it's enforced
 * server-side, not here: this channel is opened with `private: true`, and
 * for any roomId that corresponds to a real, listed party (a row in
 * watch_parties), Supabase Realtime Authorization (RLS on
 * realtime.messages, see supabase/migrations/20260808050000_watch_room_
 * realtime_rls.sql) rejects the connection entirely unless the caller is
 * an invited FRAME member — before any broadcast/presence message is ever
 * sent or received, not just before advanceQueue. A rejected connection
 * surfaces here as `denied` (see the CHANNEL_ERROR handling below), not as
 * a silently-ignored button press. Ad-hoc, unlisted rooms (the "Watch
 * together" button on a video) were never given a watch_parties row at
 * all, so that same RLS check falls through to permissive for them,
 * unchanged from before — this is intentionally scoped to listed parties
 * only, not a blanket auth requirement on every room.
 */
export function useWatchRoom(
  roomId: string,
  initialVideoId: string,
  videoRef: RefObject<HTMLVideoElement | null>
) {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [isHost, setIsHost] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [currentVideoId, setCurrentVideoId] = useState(initialVideoId);
  // True once the Realtime server has actually rejected this connection —
  // not merely "not yet subscribed". Only meaningful for listed parties
  // (see the module doc comment); ad-hoc rooms should never hit this.
  const [denied, setDenied] = useState(false);
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);
  const queueRef = useRef<QueueItem[]>([]);
  const selfId = useMemo(() => crypto.randomUUID(), []);
  const [joinedAt] = useState(() => Date.now());

  const broadcastSync = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const payload: SyncPayload = { time: video.currentTime, paused: video.paused, at: Date.now() };
    channelRef.current?.send({ type: "broadcast", event: "sync", payload });
  }, [videoRef]);

  // self: false means this client never receives its own broadcast back —
  // apply locally in addition to sending, not instead of.
  const setQueueSynced = useCallback((next: QueueItem[]) => {
    setQueue(next);
    channelRef.current?.send({ type: "broadcast", event: "queue-set", payload: next });
  }, []);

  const addToQueue = useCallback(
    (item: QueueItem) => setQueueSynced([...queueRef.current, item]),
    [setQueueSynced]
  );

  const removeFromQueue = useCallback(
    (id: string) => setQueueSynced(queueRef.current.filter((item) => item.id !== id)),
    [setQueueSynced]
  );

  const moveQueueItem = useCallback(
    (id: string, direction: "up" | "down") => {
      const items = [...queueRef.current];
      const index = items.findIndex((item) => item.id === id);
      const swapWith = direction === "up" ? index - 1 : index + 1;
      if (index === -1 || swapWith < 0 || swapWith >= items.length) return;
      [items[index], items[swapWith]] = [items[swapWith], items[index]];
      setQueueSynced(items);
    },
    [setQueueSynced]
  );

  // Callable by any member — see this file's own top-level doc comment for
  // why advanceQueue is deliberately not host-gated. WatchTogetherPlayer
  // only actually calls it from onEnded when `isHost`, but that's a
  // duplicate-broadcast guard (every participant's <video> fires `ended` at
  // once; only one of them should trigger the auto-advance), not an
  // authorization check — a "skip"/manual-advance control open to any
  // participant would call this the same way. Reads queueRef (not the
  // `queue` state) so it works from a handler that isn't itself part of a
  // render, without needing to be a dependency anywhere.
  const advanceQueue = useCallback(() => {
    const [next, ...rest] = queueRef.current;
    if (!next) return;
    setQueue(rest);
    setCurrentVideoId(next.id);
    channelRef.current?.send({
      type: "broadcast",
      event: "advance",
      payload: { videoId: next.id, queue: rest },
    });
  }, []);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`watch-room:${roomId}`, {
      config: { broadcast: { self: false }, presence: { key: selfId }, private: true },
    });

    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState<PresenceMeta>();
      const entries = Object.entries(state)
        .map(([id, presences]) => ({ id, joinedAt: presences[0]?.joinedAt ?? Date.now() }))
        .sort((a, b) => a.joinedAt - b.joinedAt);
      setParticipants(entries);
      const nowHost = entries[0]?.id === selfId;
      setIsHost(nowHost);

      // A late joiner otherwise sits frozen until the next heartbeat/action
      // — the authority pushes current state the moment presence changes.
      if (nowHost) broadcastSync();
    });

    channel.on("broadcast", { event: "sync" }, ({ payload }) => {
      const video = videoRef.current;
      if (!video) return;
      applySync(video, payload as SyncPayload);
    });

    channel.on("broadcast", { event: "queue-set" }, ({ payload }) => {
      setQueue(payload as QueueItem[]);
    });

    channel.on("broadcast", { event: "advance" }, ({ payload }) => {
      const { videoId, queue: newQueue } = payload as { videoId: string; queue: QueueItem[] };
      setQueue(newQueue);
      setCurrentVideoId(videoId);
    });

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        channel.track({ joinedAt } satisfies PresenceMeta);
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        // RLS on realtime.messages rejected this connection (not an
        // invited member, for a listed party — see the module doc
        // comment) — surfaced to callers rather than left as a silently
        // frozen room.
        setDenied(true);
      }
    });

    channelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  // Drift-correction heartbeat — authority only, only while actually playing.
  useEffect(() => {
    if (!isHost) return;
    const interval = setInterval(() => {
      if (videoRef.current && !videoRef.current.paused) broadcastSync();
    }, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isHost, broadcastSync, videoRef]);

  return {
    participants,
    isHost,
    broadcastSync,
    queue,
    addToQueue,
    removeFromQueue,
    moveQueueItem,
    advanceQueue,
    currentVideoId,
    denied,
  };
}
