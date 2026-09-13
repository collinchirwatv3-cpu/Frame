"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Participant, RoomChannel } from "@/lib/use-watch-room";

export type VoicePhase = "idle" | "requesting" | "live" | "denied" | "unsupported" | "full";

// Free, no account/vendor to set up — sufficient for the common case. TURN
// (needed for the ~10-20% of real-world connections behind symmetric NATs/
// restrictive firewalls) is a deliberately deferred follow-up, not set up
// anywhere in this repo yet — see the plan file. Those participants will
// fail to connect voice specifically; video sync is unaffected, since that
// runs over Realtime Broadcast, not P2P media.
const ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

// Mesh WebRTC — each peer holds a direct connection to every other peer.
// Quality/CPU cost is O(n) per peer and O(n^2) total connections, which is
// fine for an intimate watch-party group but degrades past this ceiling.
// Enforced as an explicit, visible block rather than a silent quality cliff.
export const MAX_VOICE_PARTICIPANTS = 8;

const SPEAKING_RMS_THRESHOLD = 0.02;

type SignalEnvelope<T> = { from: string; to: string } & T;
type OfferPayload = SignalEnvelope<{ sdp: string }>;
type AnswerPayload = SignalEnvelope<{ sdp: string }>;
type IceCandidatePayload = SignalEnvelope<{ candidate: RTCIceCandidateInit }>;
type MuteRequestPayload = { from: string; to: string };
type MuteStatePayload = { participantId: string; muted: boolean };

function isSupported(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}

// Deterministic so both sides of a pair independently compute the same
// answer without exchanging any extra state — avoids offer/answer glare
// (both peers initiating to each other at once). Mirrors this file's own
// use-watch-room.ts sibling, which already orders participants by joinedAt
// for host election; the earlier joiner always initiates to the later one,
// tie-broken by id for the pathological same-millisecond case.
function isInitiator(self: Participant, other: Participant): boolean {
  if (self.joinedAt !== other.joinedAt) return self.joinedAt < other.joinedAt;
  return self.id < other.id;
}

/**
 * Live voice chat for a Watch Party room — mesh WebRTC, signaled over the
 * same private, already-RLS-authorized Realtime channel use-watch-room.ts
 * opened for playback sync (new broadcast event types only; no new backend
 * surface). See the plan file for why mesh over a hosted SFU, and for the
 * accepted trade-offs below.
 *
 * PRODUCT RULE — mute is voluntary compliance, not server-enforced: there
 * is no media relay in the middle of a mesh call, so "host mutes X" is a
 * `mute-request` broadcast that X's own client complies with by disabling
 * its outgoing audio track. A deliberately modified client could ignore
 * it. This is the same cooperative-trust model the queue in
 * use-watch-room.ts already runs on (any member can already mutate shared
 * state) and was an explicit, confirmed trade-off for this invite-gated,
 * cooperative room — not an oversight. As a narrow correctness guard (not
 * a security boundary — that guard is unenforceable in mesh WebRTC by
 * construction), a received `mute-request` is only honored if its `from`
 * matches whoever this client currently computes as host, so an ordinary
 * non-host participant spamming mute requests is a no-op rather than
 * something every client would otherwise blindly obey.
 */
export function useWatchRoomVoice(
  channel: RoomChannel | null,
  selfId: string,
  participants: Participant[],
  isHost: boolean
) {
  const [phase, setPhase] = useState<VoicePhase>(isSupported() ? "idle" : "unsupported");
  const [errorMessage, setErrorMessage] = useState("");
  const [localMuted, setLocalMuted] = useState(false);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [mutedParticipants, setMutedParticipants] = useState<Set<string>>(new Set());
  const [speakingIds, setSpeakingIds] = useState<Set<string>>(new Set());

  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  // Latest-value refs so channel handlers (registered once per channel
  // identity, below) never close over stale participants/host/phase — same
  // "ref mirrors state, written in its own no-deps effect" shape used in
  // use-notifications-realtime.ts, since writing a ref during render is
  // rejected by this repo's lint config.
  const participantsRef = useRef(participants);
  useEffect(() => {
    participantsRef.current = participants;
  });
  const isHostRef = useRef(isHost);
  useEffect(() => {
    isHostRef.current = isHost;
  });
  const phaseRef = useRef(phase);
  useEffect(() => {
    phaseRef.current = phase;
  });

  const selfParticipant = useCallback((): Participant => {
    const found = participantsRef.current.find((p) => p.id === selfId);
    if (found) return found;
    // Presence hasn't reported this client's own entry back yet — should
    // be momentary. Never used to compute isInitiator against a peer that
    // itself isn't in `participants` yet either, so this fallback's exact
    // joinedAt value doesn't affect correctness, only its presence.
    return { id: selfId, joinedAt: Date.now(), profileId: null, username: "", displayName: "", avatarUrl: "" };
  }, [selfId]);

  function closePeer(peerId: string) {
    peersRef.current.get(peerId)?.close();
    peersRef.current.delete(peerId);
    setRemoteStreams((prev) => {
      if (!prev.has(peerId)) return prev;
      const next = new Map(prev);
      next.delete(peerId);
      return next;
    });
  }

  function createPeerConnection(peerId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    localStreamRef.current?.getTracks().forEach((track) => {
      if (localStreamRef.current) pc.addTrack(track, localStreamRef.current);
    });
    pc.ontrack = (event) => {
      setRemoteStreams((prev) => new Map(prev).set(peerId, event.streams[0]));
    };
    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      channel?.send({
        type: "broadcast",
        event: "voice-ice-candidate",
        payload: { from: selfId, to: peerId, candidate: event.candidate.toJSON() } satisfies IceCandidatePayload,
      });
    };
    peersRef.current.set(peerId, pc);
    return pc;
  }

  async function initiateOfferTo(peerId: string) {
    const pc = createPeerConnection(peerId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    channel?.send({
      type: "broadcast",
      event: "voice-offer",
      payload: { from: selfId, to: peerId, sdp: offer.sdp ?? "" } satisfies OfferPayload,
    });
  }

  // Connects to every current participant this client should initiate
  // to, and reacts to later arrivals/departures — one effect covering
  // both "who's here when I join" and "who joins/leaves while I'm live".
  useEffect(() => {
    if (phase !== "live") return;
    const self = selfParticipant();
    const currentIds = new Set(participants.map((p) => p.id));

    for (const participant of participants) {
      if (participant.id === selfId) continue;
      if (peersRef.current.has(participant.id)) continue;
      if (isInitiator(self, participant)) {
        initiateOfferTo(participant.id).catch(() => {
          // A failed offer just means that one peer never connects — not
          // fatal to the rest of the mesh or to this client's own session.
        });
      }
      // Non-initiators do nothing proactively — they create their peer
      // connection lazily upon actually receiving voice-offer, below.
    }

    for (const peerId of peersRef.current.keys()) {
      if (!currentIds.has(peerId)) closePeer(peerId);
    }
    // selfParticipant/initiateOfferTo close over refs/selfId only — safe to
    // omit, and including them would re-run this on every render instead
    // of only on real participant-list/phase changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participants, phase, selfId]);

  // Signaling handlers — registered once per channel identity, reading
  // current participants/host via refs rather than depending on them
  // directly (this effect would otherwise need to tear down and re-attach
  // handlers on every presence change, which risks dropping a message
  // mid-flight).
  useEffect(() => {
    if (!channel) return;

    channel.on("broadcast", { event: "voice-offer" }, async ({ payload }) => {
      const { from, to, sdp } = payload as OfferPayload;
      if (to !== selfId || phaseRef.current !== "live") return;
      const pc = createPeerConnection(from);
      await pc.setRemoteDescription({ type: "offer", sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      channel.send({
        type: "broadcast",
        event: "voice-answer",
        payload: { from: selfId, to: from, sdp: answer.sdp ?? "" } satisfies AnswerPayload,
      });
    });

    channel.on("broadcast", { event: "voice-answer" }, async ({ payload }) => {
      const { from, to, sdp } = payload as AnswerPayload;
      if (to !== selfId) return;
      const pc = peersRef.current.get(from);
      await pc?.setRemoteDescription({ type: "answer", sdp });
    });

    channel.on("broadcast", { event: "voice-ice-candidate" }, async ({ payload }) => {
      const { from, to, candidate } = payload as IceCandidatePayload;
      if (to !== selfId) return;
      await peersRef.current.get(from)?.addIceCandidate(candidate).catch(() => {});
    });

    channel.on("broadcast", { event: "mute-request" }, ({ payload }) => {
      const { from, to } = payload as MuteRequestPayload;
      const currentHostId = [...participantsRef.current].sort((a, b) => a.joinedAt - b.joinedAt)[0]?.id;
      // Only a request from whoever this client currently recognizes as
      // host is honored — see this hook's own doc comment on why this is a
      // correctness guard, not an enforceable security boundary.
      if (to !== selfId || from !== currentHostId) return;
      localStreamRef.current?.getAudioTracks().forEach((track) => (track.enabled = false));
      setLocalMuted(true);
      channel.send({
        type: "broadcast",
        event: "mute-state",
        payload: { participantId: selfId, muted: true } satisfies MuteStatePayload,
      });
    });

    channel.on("broadcast", { event: "mute-state" }, ({ payload }) => {
      const { participantId, muted } = payload as MuteStatePayload;
      setMutedParticipants((prev) => {
        const next = new Set(prev);
        if (muted) next.add(participantId);
        else next.delete(participantId);
        return next;
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, selfId]);

  // Speaking detection — one shared analysis loop across local + every
  // remote stream, driving a lightweight "who's talking" indicator in
  // ParticipantsPanel. Reuses streams already flowing through this hook;
  // no new peer-connection surface.
  useEffect(() => {
    if (phase !== "live") return;
    const streams = new Map(remoteStreams);
    if (localStreamRef.current) streams.set(selfId, localStreamRef.current);
    if (streams.size === 0) return;

    const audioContext = new AudioContext();
    const analysers = new Map<string, AnalyserNode>();
    const buffers = new Map<string, Uint8Array<ArrayBuffer>>();
    for (const [id, stream] of streams) {
      if (stream.getAudioTracks().length === 0) continue;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      analysers.set(id, analyser);
      // Constructed from an explicit ArrayBuffer, not the (size) shorthand
      // — this TS/lib.dom version types getByteTimeDomainData as requiring
      // Uint8Array<ArrayBuffer> specifically, which the shorthand's
      // ArrayBufferLike-backed inference doesn't satisfy.
      buffers.set(id, new Uint8Array(new ArrayBuffer(analyser.fftSize)));
    }

    let frame: number;
    function tick() {
      const speaking = new Set<string>();
      for (const [id, analyser] of analysers) {
        const buffer = buffers.get(id);
        if (!buffer) continue;
        analyser.getByteTimeDomainData(buffer);
        let sumSquares = 0;
        for (const sample of buffer) {
          const normalized = (sample - 128) / 128;
          sumSquares += normalized * normalized;
        }
        const rms = Math.sqrt(sumSquares / buffer.length);
        if (rms > SPEAKING_RMS_THRESHOLD) speaking.add(id);
      }
      setSpeakingIds(speaking);
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      audioContext.close().catch(() => {});
    };
  }, [phase, remoteStreams, selfId]);

  const join = useCallback(() => {
    if (!isSupported()) {
      setPhase("unsupported");
      return;
    }
    if (participantsRef.current.length > MAX_VOICE_PARTICIPANTS) {
      setPhase("full");
      return;
    }
    setPhase("requesting");
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        localStreamRef.current = stream;
        setPhase("live");
      })
      .catch((err) => {
        setErrorMessage(err instanceof Error ? err.message : "Microphone access was denied.");
        setPhase("denied");
      });
  }, []);

  const leave = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    for (const peerId of [...peersRef.current.keys()]) closePeer(peerId);
    setRemoteStreams(new Map());
    setMutedParticipants(new Set());
    setLocalMuted(false);
    setPhase(isSupported() ? "idle" : "unsupported");
  }, []);

  useEffect(() => {
    return () => leave();
  }, [leave]);

  const toggleSelfMute = useCallback(() => {
    if (!localStreamRef.current) return;
    const nextMuted = !localMuted;
    localStreamRef.current.getAudioTracks().forEach((track) => (track.enabled = !nextMuted));
    setLocalMuted(nextMuted);
    channel?.send({
      type: "broadcast",
      event: "mute-state",
      payload: { participantId: selfId, muted: nextMuted } satisfies MuteStatePayload,
    });
  }, [channel, localMuted, selfId]);

  const requestMute = useCallback(
    (participantId: string) => {
      if (!isHostRef.current || participantId === selfId) return;
      channel?.send({
        type: "broadcast",
        event: "mute-request",
        payload: { from: selfId, to: participantId } satisfies MuteRequestPayload,
      });
    },
    [channel, selfId]
  );

  // One mute-request per currently voice-connected peer, reusing the exact
  // same event/addressing requestMute already uses — not a new "mute
  // unless you're the sender" event type, which would need a second
  // interpretation branch in the mute-request handler above for no real
  // benefit at MAX_VOICE_PARTICIPANTS. remoteStreams (already tracked by
  // this hook) is "who's actually voice-connected" — callers don't need to
  // compute that themselves.
  const requestMuteAll = useCallback(() => {
    if (!isHostRef.current) return;
    for (const peerId of remoteStreams.keys()) {
      channel?.send({
        type: "broadcast",
        event: "mute-request",
        payload: { from: selfId, to: peerId } satisfies MuteRequestPayload,
      });
    }
  }, [channel, remoteStreams, selfId]);

  return {
    phase,
    errorMessage,
    localMuted,
    remoteStreams,
    mutedParticipants,
    speakingIds,
    join,
    leave,
    toggleSelfMute,
    requestMute,
    requestMuteAll,
  };
}
