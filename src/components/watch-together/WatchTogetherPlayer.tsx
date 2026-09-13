"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import NextLink from "next/link";
import { Check, Crown, Link2, LogOut, Mic, MicOff, Trash2, Users, Volume2, VolumeX } from "lucide-react";
import { useWatchRoom } from "@/lib/use-watch-room";
import { useWatchRoomVoice } from "@/lib/use-watch-room-voice";
import { fetchVideoById } from "@/lib/watch-together";
import { fetchPartyById, deleteParty, type WatchParty } from "@/lib/watch-parties";
import { useCurrentUserStore } from "@/store/current-user-store";
import { AddToQueueSheet } from "./AddToQueueSheet";
import { ParticipantsPanel } from "./ParticipantsPanel";
import { QueuePanel } from "./QueuePanel";
import { CHROME_GLASS_CLASS, CHROME_TAP_SCALE_CLASS } from "@/lib/chrome";
import { cn } from "@/lib/utils";
import type { Video } from "@/lib/types";

// A MediaStream can't be set via <audio src> — it needs the srcObject
// property, which only exists imperatively. Not visible: only the video's
// own <video> element is ever seen; remote voice plays through these.
function RemoteVoiceAudio({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return <audio ref={ref} autoPlay className="hidden" />;
}

/** In-party page — an inline "control panel" layout (video on top, then
 * always-visible Participants/Queue sections below), not the full-screen
 * cinematic overlay every other video screen in FRAME uses. A deliberate,
 * confirmed visual departure for this one screen — see the plan file. */
export function WatchTogetherPlayer({
  video: initialVideo,
  roomId,
}: {
  video: Video;
  roomId: string;
}) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [copied, setCopied] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [video, setVideo] = useState(initialVideo);
  // Full party row, not just its title — needed for the REAL host_id below.
  // Ad-hoc rooms (the "Watch together" button on a video) have no
  // watch_parties row at all, so this stays null for them either way
  // (missing vs. ad-hoc collapse into the same fallback state).
  const [party, setParty] = useState<WatchParty | null>(null);
  const [ending, setEnding] = useState(false);
  const ownProfile = useCurrentUserStore((s) => s.profile);
  const {
    selfId,
    channel,
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
  } = useWatchRoom(roomId, initialVideo.id, videoRef);

  // Deliberately NOT the same thing as useWatchRoom's `isHost` above —
  // that's a sync-authority role (whoever's presence has been tracked
  // longest), used for playback-sync broadcasting and voice-mute privilege
  // by design (see use-watch-room.ts/use-watch-room-voice.ts's own doc
  // comments — real, confirmed product decisions, not bugs). It is NOT the
  // same person as watch_parties.host_id, which is what
  // watch_parties_delete_own's RLS actually checks. Before this fix, End
  // Party's visibility was tied to sync-authority `isHost` — meaning
  // whoever happened to have been present longest could see and tap "End
  // Party" even if they weren't the real host, and deleteParty would
  // silently affect zero rows (RLS filters rather than errors), while the
  // real host might not see the button at all after a reconnect changed
  // who counts as longest-present. This uses the exact same
  // `ownProfile.id === party.host.id` check PartyCard.tsx already uses
  // correctly on the parties list.
  const isRealHost = !!party && !!ownProfile && ownProfile.id === party.host.id;

  const voice = useWatchRoomVoice(channel, selfId, participants, isHost);
  const voiceConnectedIds = new Set(
    voice.phase === "live" ? [...voice.remoteStreams.keys(), selfId] : [...voice.remoteStreams.keys()]
  );

  useEffect(() => {
    fetchPartyById(roomId).then(setParty);
  }, [roomId]);

  // currentVideoId only ever changes via the room's "advance" broadcast
  // (see use-watch-room.ts) — when it does, every client (not just the
  // authority who triggered it) swaps to the new video the same way.
  useEffect(() => {
    if (currentVideoId === video.id) return;
    fetchVideoById(currentVideoId).then((v) => {
      if (v) setVideo(v);
    });
  }, [currentVideoId, video.id]);

  async function copyInviteLink() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  async function handleEnd() {
    if (ending || !window.confirm("End this Frame Party for everyone?")) return;
    setEnding(true);
    const ok = await deleteParty(roomId);
    if (ok) router.push("/parties");
    else setEnding(false);
  }

  function handleLeave() {
    router.push("/parties");
  }

  // Realtime Authorization rejected this connection (not an invited
  // member, for a listed party) — same "not available" pattern as this
  // room's own not-found state (see the [roomId] page), rather than
  // leaving a silently frozen, non-syncing player on screen.
  if (denied) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 h-dvh bg-bg text-center px-6">
        <p className="text-sm font-medium">You don&apos;t have access to this Frame Party</p>
        <p className="text-xs text-text-secondary max-w-sm">
          This party is invite-only — you&apos;ll need a FRAMES invite to join.
        </p>
        <NextLink href="/discover" className="mt-2 text-xs text-primary underline underline-offset-2">
          Go to FRAMES
        </NextLink>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-bg pb-24 md:pb-8">
      <div className="max-w-2xl mx-auto px-4 md:px-6 pt-6 flex flex-col gap-5">
        {/* Header — title, host, participant count (in that order, ahead of
            the player) per the Frame Party hierarchy. */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold truncate">{party?.title ?? video.title}</h1>
            <div className="flex items-center gap-2.5 mt-0.5 text-xs text-text-secondary">
              {party && (
                <span className="flex items-center gap-1">
                  <Crown size={11} className="text-primary shrink-0" />
                  {isRealHost ? "You're hosting" : `Hosted by ${party.host.displayName}`}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Users size={11} />
                {participants.length} watching
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={copyInviteLink}
              aria-label="Copy invite link"
              className={cn(CHROME_GLASS_CLASS, CHROME_TAP_SCALE_CLASS, "w-9 h-9 flex items-center justify-center")}
            >
              {copied ? <Check size={16} className="text-primary" /> : <Link2 size={16} />}
            </button>
            {voice.phase !== "unsupported" && (
              <button
                onClick={() => (voice.phase === "live" ? voice.toggleSelfMute() : voice.join())}
                disabled={voice.phase === "requesting" || voice.phase === "full"}
                aria-label={
                  voice.phase === "live"
                    ? voice.localMuted
                      ? "Unmute your microphone"
                      : "Mute your microphone"
                    : "Join voice chat"
                }
                title={voice.phase === "full" ? "Voice chat is full for this party" : undefined}
                className={cn(
                  CHROME_GLASS_CLASS,
                  CHROME_TAP_SCALE_CLASS,
                  "w-9 h-9 flex items-center justify-center",
                  voice.phase === "full" && "opacity-50"
                )}
              >
                {voice.phase === "live" ? (
                  voice.localMuted ? (
                    <MicOff size={16} className="text-primary" />
                  ) : (
                    <Mic size={16} className="text-primary" />
                  )
                ) : (
                  <Mic size={16} className={voice.phase === "requesting" ? "animate-pulse" : undefined} />
                )}
              </button>
            )}
          </div>
        </div>

        {/* Video */}
        <div className="relative aspect-video rounded-2xl overflow-hidden bg-card">
          <video
            ref={videoRef}
            key={video.id}
            src={video.playbackUrl}
            poster={video.posterUrl}
            className="w-full h-full object-contain"
            muted={muted}
            autoPlay
            playsInline
            controls={isHost}
            onPlay={() => isHost && broadcastSync()}
            onPause={() => isHost && broadcastSync()}
            onSeeked={() => isHost && broadcastSync()}
            onEnded={() => isHost && advanceQueue()}
          />
          <button
            onClick={() => setMuted((m) => !m)}
            aria-label={muted ? "Unmute Frame" : "Mute Frame"}
            className={cn(
              CHROME_GLASS_CLASS,
              CHROME_TAP_SCALE_CLASS,
              "absolute bottom-3 left-3 w-9 h-9 flex items-center justify-center"
            )}
          >
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
        </div>

        {[...voice.remoteStreams.entries()].map(([participantId, stream]) => (
          <RemoteVoiceAudio key={participantId} stream={stream} />
        ))}

        {/* Real attribution for the video currently playing — this is the
            CLIP's creator, not necessarily the party's host (a host can
            queue anyone's public Frame). Was "Hosted by @creator" before,
            which conflated the two and was simply wrong whenever the
            playing Frame wasn't made by the host. */}
        <p className="text-sm text-text-secondary -mt-2">By @{video.creator.username}</p>

        <div className="h-px bg-border" />

        {/* Queue ahead of Participants — "up next" is the more actionable,
            more frequently-referenced section of the two while a party is
            actually running. */}
        <QueuePanel
          nowPlaying={video}
          queue={queue}
          onMove={moveQueueItem}
          onRemove={removeFromQueue}
          onAdd={() => setAddOpen(true)}
        />

        <div className="h-px bg-border" />

        <ParticipantsPanel
          participants={participants}
          selfId={selfId}
          realHostId={party?.host.id ?? null}
          isHost={isHost}
          voiceConnectedIds={voiceConnectedIds}
          mutedParticipants={voice.mutedParticipants}
          speakingIds={voice.speakingIds}
          onRequestMute={voice.requestMute}
          onRequestMuteAll={voice.requestMuteAll}
        />

        <div className="h-px bg-border" />

        <div className="flex items-center gap-3 pb-4">
          <button
            onClick={handleLeave}
            className={cn(CHROME_GLASS_CLASS, CHROME_TAP_SCALE_CLASS, "flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium")}
          >
            <LogOut size={14} />
            Leave Party
          </button>
          {/* Real host only (watch_parties.host_id), never the sync-authority
              isHost — see this component's own doc comment on isRealHost
              above for why that distinction matters here specifically. Also
              requires a real party (ad-hoc "Watch together" rooms have no
              watch_parties row to end at all). */}
          {isRealHost && (
            <button
              onClick={handleEnd}
              disabled={ending}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-full bg-red-500/90 text-white text-sm font-semibold disabled:opacity-50 transition-opacity"
            >
              <Trash2 size={14} />
              {ending ? "Ending…" : "End Party"}
            </button>
          )}
        </div>
      </div>

      <AddToQueueSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdd={addToQueue}
        queuedIds={[video.id, ...queue.map((q) => q.id)]}
      />
    </div>
  );
}
