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
 * Genuinely synced playback for a shared "watch together" room, built on
 * Supabase Realtime Broadcast + Presence — no new table, no migration, no
 * RLS: an open (non-private) channel keyed by roomId, same trust model as
 * the existing /s/[token] share links (anyone with the link can join).
 *
 * No fixed host — whoever has been in the room longest (earliest tracked
 * presence) is the sync authority. That falls out for free on host
 * disconnect: presence drops their entry, the next-earliest immediately
 * becomes authoritative, no explicit handoff code needed. Only the
 * authority's play/pause/seek and periodic heartbeat get broadcast;
 * everyone else's <video> is driven by applySync, not local interaction.
 */
export function useWatchRoom(roomId: string, videoRef: RefObject<HTMLVideoElement | null>) {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [isHost, setIsHost] = useState(false);
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);
  const selfId = useMemo(() => crypto.randomUUID(), []);
  const [joinedAt] = useState(() => Date.now());

  const broadcast = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const payload: SyncPayload = { time: video.currentTime, paused: video.paused, at: Date.now() };
    channelRef.current?.send({ type: "broadcast", event: "sync", payload });
  }, [videoRef]);

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
      if (nowHost) broadcast();
    });

    channel.on("broadcast", { event: "sync" }, ({ payload }) => {
      const video = videoRef.current;
      if (!video) return;
      applySync(video, payload as SyncPayload);
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
      if (videoRef.current && !videoRef.current.paused) broadcast();
    }, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isHost, broadcast, videoRef]);

  return { participants, isHost, broadcast };
}
