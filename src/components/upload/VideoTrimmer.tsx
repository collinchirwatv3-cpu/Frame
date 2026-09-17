"use client";

import { useRef } from "react";
import { Scissors } from "lucide-react";
import { formatTimestamp } from "@/lib/utils";
import { pickTicks, MINOR_TICK_FRACTIONS } from "@/lib/time-ruler";

const MIN_TRIM_SECONDS = 1;

type Props = {
  durationSeconds: number;
  start: number;
  end: number;
  onChange: (start: number, end: number) => void;
  /** Called with whichever handle's new position, so the caller can seek
   * its own preview <video> there — same "drag a trim handle, see that
   * frame" pattern as ClipCreateSheet's dual-handle track. */
  onScrub?: (seconds: number) => void;
};

/** Two-handle trim range for the primary uploaded video, before it's ever
 * published — same drag math as ClipCreateSheet's post-publish clip track
 * (pointer capture + getBoundingClientRect fraction), but bounds what the
 * *published* video itself plays back (src/lib/video-trim.ts), not a
 * separate viewer-created clip. No dedicated playhead here: the caller's
 * own preview <video> (already visible above this) doubles as the scrub
 * preview via onScrub. */
export function VideoTrimmer({ durationSeconds, start, end, onChange, onScrub }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const duration = Math.max(durationSeconds, 0.01);
  const startFraction = start / duration;
  const endFraction = end / duration;
  const minGapFraction = Math.min(MIN_TRIM_SECONDS / duration, 1);
  const ticks = pickTicks(durationSeconds);

  function fractionFromClientX(clientX: number): number {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  }

  function handleStartMove(e: React.PointerEvent<HTMLDivElement>) {
    e.stopPropagation(); // see handlePointerDown's comment
    const f = fractionFromClientX(e.clientX);
    const clamped = Math.min(Math.max(f, 0), Math.max(0, endFraction - minGapFraction));
    const seconds = clamped * duration;
    onChange(seconds, end);
    onScrub?.(seconds);
  }

  function handleEndMove(e: React.PointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    const f = fractionFromClientX(e.clientX);
    const clamped = Math.min(Math.max(f, startFraction + minGapFraction), 1);
    const seconds = clamped * duration;
    onChange(start, seconds);
    onScrub?.(seconds);
  }

  // Without this, a drag starting on a handle also fires this track's own
  // ancestor pointer handlers, if it ever grows one (same guard
  // ClipCreateSheet's identical track uses for its three handles).
  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  return (
    <div className="mt-4 rounded-2xl border border-border bg-card/50 px-4 py-3">
      <div className="flex items-center gap-1.5 text-xs font-medium mb-2.5">
        <Scissors size={13} className="text-primary" />
        Trim
      </div>

      <div className="flex items-center justify-between text-[11px] mb-2">
        <span className="text-text-secondary">
          IN <span className="tabular-nums text-text font-medium">{formatTimestamp(start)}</span>
        </span>
        <span className="tabular-nums text-primary font-semibold">{formatTimestamp(end - start)} selected</span>
        <span className="text-text-secondary">
          OUT <span className="tabular-nums text-text font-medium">{formatTimestamp(end)}</span>
        </span>
      </div>

      {/* Labeled ruler ticks (nice round numbers, scaled to duration) —
          purely a readout, not interactive. */}
      <div className="relative h-3 mb-1 text-[10px] text-text-secondary select-none" aria-hidden="true">
        {ticks.map((t) => (
          <span
            key={t}
            className="absolute -translate-x-1/2 tabular-nums first:translate-x-0"
            style={{ left: `${(t / duration) * 100}%` }}
          >
            {formatTimestamp(t)}
          </span>
        ))}
      </div>

      <div ref={trackRef} className="relative h-9 touch-none">
        <div className="absolute inset-0 rounded-full border border-border bg-bg overflow-hidden flex items-center justify-between px-px" aria-hidden="true">
          {MINOR_TICK_FRACTIONS.map((f) => (
            <span key={f} className="w-px h-1.5 bg-border shrink-0" />
          ))}
        </div>
        <div
          className="absolute inset-y-0 rounded-full bg-primary/25"
          style={{ left: `${startFraction * 100}%`, right: `${(1 - endFraction) * 100}%` }}
        />
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={(e) => e.buttons === 1 && handleStartMove(e)}
          className="absolute inset-y-0 w-1.5 rounded-full bg-primary -translate-x-1/2 cursor-grab active:cursor-grabbing touch-none"
          style={{ left: `${startFraction * 100}%` }}
          role="slider"
          aria-label="Trim start"
          aria-valuemin={0}
          aria-valuemax={duration}
          aria-valuenow={start}
          aria-valuetext={formatTimestamp(start)}
        />
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={(e) => e.buttons === 1 && handleEndMove(e)}
          className="absolute inset-y-0 w-1.5 rounded-full bg-primary -translate-x-1/2 cursor-grab active:cursor-grabbing touch-none"
          style={{ left: `${endFraction * 100}%` }}
          role="slider"
          aria-label="Trim end"
          aria-valuemin={0}
          aria-valuemax={duration}
          aria-valuenow={end}
          aria-valuetext={formatTimestamp(end)}
        />
      </div>
      <div className="flex justify-between text-[11px] tabular-nums text-text-secondary mt-1">
        <span>0:00</span>
        <span>{formatTimestamp(durationSeconds)}</span>
      </div>
    </div>
  );
}
