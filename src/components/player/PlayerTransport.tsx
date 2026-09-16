"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { CHROME_FADE_TRANSITION } from "@/lib/motion";
import { usePlayerStore } from "@/store/player-store";

function timeLabel(seconds: number) {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** Shared feed transport: a thin visual track with a full touch target. */
export function PlayerTransport({ paused, time, duration, hidden, onToggle, onSeek, className }: {
  paused: boolean;
  time: number;
  duration: number;
  hidden: boolean;
  onToggle: () => void;
  onSeek: (seconds: number) => void;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const setScrubbing = usePlayerStore((s) => s.setScrubbing);
  const total = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const position = Number.isFinite(time) ? Math.min(total, Math.max(0, time)) : 0;
  return (
    <motion.div
      animate={{ opacity: hidden ? 0 : 1 }}
      transition={reduceMotion ? { duration: 0 } : CHROME_FADE_TRANSITION}
      aria-hidden={hidden}
      inert={hidden}
      style={{ pointerEvents: hidden ? "none" : "auto" }}
      role="group"
      aria-label="Video playback"
      className={cn("flex items-center gap-2 text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.65)] sm:gap-3", className)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      onFocusCapture={() => setScrubbing(true)}
      onBlurCapture={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setScrubbing(false); }}
    >
      <button type="button" onClick={onToggle} aria-label={paused ? "Play video" : "Pause video"}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black/20 backdrop-blur-sm transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white motion-reduce:transition-none">
        {paused ? <Play size={18} strokeWidth={1.75} /> : <Pause size={18} strokeWidth={1.75} />}
      </button>
      <span className="min-w-8 text-center text-[11px] font-medium tabular-nums text-white/75">{timeLabel(position)}</span>
      <input type="range" min={0} max={total || 1} step={0.1} value={position} disabled={!total}
        aria-label="Seek video" aria-valuetext={`${timeLabel(position)} of ${timeLabel(total)}`}
        className="player-timeline min-w-0 flex-1"
        style={{ backgroundImage: `linear-gradient(to right, rgb(255 255 255 / 90%) ${total ? position / total * 100 : 0}%, rgb(255 255 255 / 25%) 0%)` }}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setScrubbing(true); }}
        onPointerUp={() => setScrubbing(false)} onPointerCancel={() => setScrubbing(false)}
        onLostPointerCapture={() => setScrubbing(false)} onBlur={() => setScrubbing(false)}
        onChange={(e) => onSeek(Number(e.currentTarget.value))}
      />
      <span className="min-w-8 text-center text-[11px] font-medium tabular-nums text-white/75">{timeLabel(total)}</span>
    </motion.div>
  );
}
