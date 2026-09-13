"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import NextLink from "next/link";
import { Check, Link2, LogOut, Mic, MicOff, Trash2, Volume2, VolumeX } from "lucide-react";
import { useWatchRoom } from "@/lib/use-watch-room";
import { useWatchRoomVoice } from "@/lib/use-watch-room-voice";
import { fetchVideoById } from "@/lib/watch-together";
import { fetchPartyById, deleteParty } from "@/lib/watch-parties";
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
  const [partyTitle, setPartyTitle] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);
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

  const voice = useWatchRoomVoice(channel, selfId, participants, isHost);
  const voiceConnectedIds = new Set(
    voice.phase === "live" ? [...voice.remoteStreams.keys(), selfId] : [...voice.remoteStreams.keys()]
  );

  // Resolves a real party's title for the header. Ad-hoc rooms (the "Watch
  // together" button on a video) have no watch_parties row at all —
  // fetchPartyById returns null either way, and the header falls back to
  // the video's own title, same case either way (missing vs. ad-hoc).
  useEffect(() => {
    fetchPartyById(roomId).then((party) => setPartyTitle(party?.title ?? null));
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
    if (ending || !window.confirm("End this watch party for everyone?")) return;
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
        <p className="text-sm font-medium">You don&apos;t have access to this watch party</p>
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
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-primary">
              {isHost ? "You're hosting" : "Watching in sync"}
            </p>
            <h1 className="text-lg font-semibold truncate">{partyTitle ?? video.title}</h1>
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
            aria-label={muted ? "Unmute video" : "Mute video"}
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

        {/* Following the host's feed / creator line */}
        <p className="text-sm text-text-secondary -mt-2">Hosted by @{video.creator.username}</p>

        <div className="h-px bg-border" />

        <ParticipantsPanel
          participants={participants}
          selfId={selfId}
          isHost={isHost}
          voiceConnectedIds={voiceConnectedIds}
          mutedParticipants={voice.mutedParticipants}
          speakingIds={voice.speakingIds}
          onRequestMute={voice.requestMute}
          onRequestMuteAll={voice.requestMuteAll}
        />

        <div className="h-px bg-border" />

        <QueuePanel
          nowPlayingTitle={video.title}
          queue={queue}
          onMove={moveQueueItem}
          onRemove={removeFromQueue}
          onAdd={() => setAddOpen(true)}
        />

        <div className="h-px bg-border" />

        <div className="flex items-center gap-3 pb-4">
          <button
            onClick={handleLeave}
            className={cn(CHROME_GLASS_CLASS, CHROME_TAP_SCALE_CLASS, "flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium")}
          >
            <LogOut size={14} />
            Leave party
          </button>
          {isHost && (
            <button
              onClick={handleEnd}
              disabled={ending}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-full bg-red-500/90 text-white text-sm font-semibold disabled:opacity-50 transition-opacity"
            >
              <Trash2 size={14} />
              {ending ? "Ending…" : "End party"}
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
