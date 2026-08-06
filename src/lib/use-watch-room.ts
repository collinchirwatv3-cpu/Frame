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
// gets a hard seek rather than trying to smoothly catch up.
const DRIFT_THRESHOLD_SECONDS = 1.5;
const HEARTBEAT_INTERVAL_MS = 5000;

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
 * built on Supabase Realtime Broadcast + Presence — no new table, no
 * migration, no RLS: an open (non-private) channel keyed by roomId, same
 * trust model as the existing /s/[token] share links (anyone with the link
 * can join).
 *
 * No fixed host — whoever has been in the room longest (earliest tracked
 * presence) is the sync authority. That falls out for free on disconnect:
 * presence drops their entry, the next-earliest immediately becomes
 * authoritative, no explicit handoff code needed. Only the authority's
 * play/pause/seek/heartbeat and queue-advance get broadcast; everyone
 * else's <video> is driven by applySync, not local interaction.
 *
 * The queue itself is a free-for-all — any participant can add, remove, or
 * reorder it, not just the authority. Every mutation broadcasts the whole
 * resulting array (`queue-set`) rather than a diff, so there's no ordering
 * dependency between two people editing near-simultaneously — whichever
 * broadcast a client sees last is authoritative for that client, same as
 * how any last-write-wins list would behave.
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

  // Authority-only — called from the current video's onEnded. Reads
  // queueRef (not the `queue` state) so it works from a handler that isn't
  // itself part of a render, without needing to be a dependency anywhere.
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
      config: { broadcast: { self: false }, presence: { key: selfId } },
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
  };
}
