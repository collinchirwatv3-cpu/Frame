"use client";

import { motion } from "framer-motion";
import { Crown, Mic, MicOff } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { DURATION, EASE_OUT } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { Participant } from "@/lib/use-watch-room";

/** Always-visible Participants section on the in-party page — replaces the
 * old ParticipantsSheet modal per the redesign's "inline control panel"
 * layout. Row-rendering logic carried over unchanged; only the modal shell
 * (backdrop, spring slide-up dialog) is gone. */
export function ParticipantsPanel({
  participants,
  selfId,
  isHost,
  voiceConnectedIds,
  mutedParticipants,
  speakingIds,
  onRequestMute,
  onRequestMuteAll,
}: {
  participants: Participant[];
  selfId: string;
  isHost: boolean;
  voiceConnectedIds: Set<string>;
  mutedParticipants: Set<string>;
  speakingIds: Set<string>;
  onRequestMute: (participantId: string) => void;
  onRequestMuteAll: () => void;
}) {
  // participants is already sorted earliest-first by useWatchRoom — the
  // same ordering that determines isHost there.
  const hostId = participants[0]?.id;
  const otherVoiceCount = [...voiceConnectedIds].filter(
    (id) => id !== selfId && !mutedParticipants.has(id)
  ).length;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
          Participants ({participants.length})
        </h2>
        {isHost && otherVoiceCount > 0 && (
          <button
            onClick={onRequestMuteAll}
            className="text-xs font-medium text-text-secondary hover:text-accent transition-colors"
          >
            Mute all others
          </button>
        )}
      </div>

      <div className="flex flex-col gap-1">
        {participants.map((participant) => {
          const isSelf = participant.id === selfId;
          const isParticipantHost = participant.id === hostId;
          const onVoice = voiceConnectedIds.has(participant.id);
          const isMuted = mutedParticipants.has(participant.id);
          const isSpeaking = onVoice && !isMuted && speakingIds.has(participant.id);
          // Host can only ever request a mute, never force an unmute — see
          // use-watch-room-voice.ts's own doc comment on why that's a
          // deliberate, not a missing, asymmetry.
          const canHostMute = isHost && !isSelf && onVoice && !isMuted;

          return (
            <div key={participant.id} className="flex items-center gap-3 py-2 rounded-xl">
              <motion.span
                animate={isSpeaking ? { scale: [1, 1.08, 1] } : { scale: 1 }}
                transition={isSpeaking ? { duration: DURATION.base, repeat: Infinity, ease: EASE_OUT } : undefined}
                className={cn("rounded-full", isSpeaking && "ring-2 ring-primary ring-offset-2 ring-offset-bg")}
              >
                <Avatar
                  src={participant.avatarUrl}
                  alt={participant.displayName}
                  size={40}
                  ring={isParticipantHost && !isSpeaking}
                />
              </motion.span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-medium truncate">
                    {participant.displayName}
                    {isSelf && <span className="text-text-secondary font-normal"> (you)</span>}
                  </p>
                  {isParticipantHost && <Crown size={12} className="text-primary shrink-0" aria-label="Host" />}
                </div>
                {participant.profileId && (
                  <p className="text-xs text-text-secondary truncate">@{participant.username}</p>
                )}
              </div>
              {canHostMute && (
                <button
                  onClick={() => onRequestMute(participant.id)}
                  aria-label={`Mute ${participant.displayName}`}
                  className="text-[11px] font-medium text-text-secondary hover:text-accent px-2 py-1 rounded-full hover:bg-bg transition-colors shrink-0"
                >
                  Mute
                </button>
              )}
              <span
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                  onVoice && !isMuted ? "text-primary" : "text-text-secondary/50"
                )}
                aria-label={onVoice ? (isMuted ? "Microphone muted" : "Microphone live") : "Not on voice chat"}
                title={onVoice ? (isMuted ? "Muted" : "Live") : "Not on voice chat"}
              >
                {onVoice && !isMuted ? <Mic size={14} /> : <MicOff size={14} />}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
