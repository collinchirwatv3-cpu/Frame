"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Check, ChevronDown, ChevronUp, Link2, Plus, Users, Volume2, VolumeX, X } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { Avatar } from "@/components/ui/Avatar";
import { useWatchRoom } from "@/lib/use-watch-room";
import { fetchVideoById } from "@/lib/watch-together";
import { AddToQueueSheet } from "./AddToQueueSheet";
import type { Video } from "@/lib/types";

// The add-to-queue prompt only shows up this close to the end — no
// standing button cluttering the view for the other 99% of a video.
const SHOW_ADD_PROMPT_SECONDS_REMAINING = 10;

export function WatchTogetherPlayer({
  video: initialVideo,
  roomId,
}: {
  video: Video;
  roomId: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [copied, setCopied] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [nearEnd, setNearEnd] = useState(false);
  const [video, setVideo] = useState(initialVideo);
  const {
    participants,
    isHost,
    broadcastSync,
    queue,
    addToQueue,
    removeFromQueue,
    moveQueueItem,
    advanceQueue,
    currentVideoId,
  } = useWatchRoom(roomId, initialVideo.id, videoRef);

  // currentVideoId only ever changes via the room's "advance" broadcast
  // (see use-watch-room.ts) — when it does, every client (not just the
  // authority who triggered it) swaps to the new video the same way.
  useEffect(() => {
    if (currentVideoId === video.id) return;
    fetchVideoById(currentVideoId).then((v) => {
      if (v) setVideo(v);
    });
  }, [currentVideoId, video.id]);

  // "Adjust state when a prop changes" during render, not in an effect —
  // resets the near-end prompt the instant the video swaps rather than one
  // render later.
  const [nearEndForVideoId, setNearEndForVideoId] = useState(video.id);
  if (video.id !== nearEndForVideoId) {
    setNearEndForVideoId(video.id);
    setNearEnd(false);
  }

  function handleTimeUpdate() {
    const el = videoRef.current;
    if (!el || !Number.isFinite(el.duration)) return;
    setNearEnd(el.duration - el.currentTime <= SHOW_ADD_PROMPT_SECONDS_REMAINING);
  }

  async function copyInviteLink() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  const showAddPrompt = nearEnd;

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-bg">
      <div className="absolute inset-0">
        <Image src={video.posterUrl} alt="" fill className="object-cover scale-125 blur-3xl opacity-40" />
      </div>

      <div className="absolute inset-0 flex items-center justify-center">
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
          onTimeUpdate={handleTimeUpdate}
          onEnded={() => isHost && advanceQueue()}
        />
      </div>

      <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-bg/90 via-bg/30 to-transparent pointer-events-none" />

      <div className="absolute top-4 left-4 md:top-6 md:left-6 flex items-center gap-2">
        <Logo size={28} />
        <span className="text-sm font-bold tracking-tight drop-shadow-sm">FRAMES</span>
      </div>

      <div className="absolute top-4 right-4 md:top-6 md:right-6 flex items-center gap-2">
        <span className="flex items-center gap-1.5 bg-card/70 backdrop-blur-md rounded-full px-3 py-1.5 text-xs font-medium">
          <Users size={13} />
          {participants.length}
        </span>
        <button
          onClick={copyInviteLink}
          aria-label="Copy invite link"
          className="w-9 h-9 rounded-full bg-card/70 backdrop-blur-md flex items-center justify-center"
        >
          {copied ? <Check size={16} className="text-primary" /> : <Link2 size={16} />}
        </button>
        <button
          onClick={() => setMuted((m) => !m)}
          aria-label={muted ? "Unmute" : "Mute"}
          className="w-9 h-9 rounded-full bg-card/70 backdrop-blur-md flex items-center justify-center"
        >
          {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
      </div>

      {!isHost && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 md:top-[4.5rem] text-[11px] font-medium text-text-secondary bg-card/70 backdrop-blur-md rounded-full px-3 py-1.5">
          Watching in sync — playback follows the host
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 px-4 md:px-8 pb-6 md:pb-10 flex flex-col gap-3 max-w-lg">
        <div className="flex items-center gap-2">
          <Avatar src={video.creator.avatarUrl} alt={video.creator.displayName} size={32} />
          <div>
            <p className="text-sm font-semibold">@{video.creator.username}</p>
            <p className="text-xs text-text-secondary">
              {isHost ? "You're hosting this watch party" : "Watch party in progress"}
            </p>
          </div>
        </div>
        <p className="text-sm text-accent/90">{video.title}</p>

        {(queue.length > 0 || showAddPrompt) && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {queue.length > 0 && <span className="text-[11px] text-text-secondary shrink-0">Up next</span>}
            {queue.map((item, index) => (
              <span
                key={item.id}
                className="flex items-center gap-1 shrink-0 bg-card/70 backdrop-blur-md rounded-full pl-2.5 pr-1 py-1 text-[11px]"
              >
                <span className="truncate max-w-[100px]">{item.title}</span>
                <button
                  onClick={() => moveQueueItem(item.id, "up")}
                  disabled={index === 0}
                  aria-label={`Move ${item.title} up`}
                  className="p-0.5 rounded-full hover:bg-bg transition-colors disabled:opacity-30"
                >
                  <ChevronUp size={11} />
                </button>
                <button
                  onClick={() => moveQueueItem(item.id, "down")}
                  disabled={index === queue.length - 1}
                  aria-label={`Move ${item.title} down`}
                  className="p-0.5 rounded-full hover:bg-bg transition-colors disabled:opacity-30"
                >
                  <ChevronDown size={11} />
                </button>
                <button
                  onClick={() => removeFromQueue(item.id)}
                  aria-label={`Remove ${item.title} from queue`}
                  className="p-0.5 rounded-full hover:bg-bg transition-colors"
                >
                  <X size={11} />
                </button>
              </span>
            ))}
            {showAddPrompt && (
              <button
                onClick={() => setAddOpen(true)}
                className="flex items-center gap-1 shrink-0 bg-primary text-bg rounded-full pl-2 pr-2.5 py-1 text-[11px] font-semibold"
              >
                <Plus size={12} />
                {queue.length === 0 ? "Add next video" : "Add"}
              </button>
            )}
          </div>
        )}
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
