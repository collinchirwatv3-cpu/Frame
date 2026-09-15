"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Scissors, X } from "lucide-react";
import { SHEET_SPRING } from "@/lib/motion";
import { useEscapeToClose } from "@/lib/use-escape-to-close";
import { formatTimestamp } from "@/lib/utils";
import { useClipsStore } from "@/store/clips-store";
import type { Video } from "@/lib/types";

const MIN_CLIP_SECONDS = 1;
const MAX_CLIP_SECONDS = 120; // matches the clips table's own check constraint

/** Same sheet skeleton as CommentDrawer/VideoOptionsSheet/VideoDetailsSheet
 * (backdrop + SHEET_SPRING slide-up + useEscapeToClose + {video, open,
 * onClose}). The two-handle range track is genuinely new UI — no existing
 * component to extend, though the drag math mirrors VideoCard.tsx's own
 * single-thumb scrub bar (pointer capture + getBoundingClientRect fraction).
 *
 * A single-track scrubber sits above the range track: a plain <video>,
 * seeked (never played) to whatever position was last touched — dragging
 * either trim handle previews that boundary's frame, and dragging/tapping
 * the track itself scrubs a separate playhead anywhere inside the
 * selected range, so a creator can see what they're actually clipping
 * instead of guessing from timestamps alone. */
export function ClipCreateSheet({ video, open, onClose }: { video: Video; open: boolean; onClose: () => void }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [startFraction, setStartFraction] = useState(0);
  const [endFraction, setEndFraction] = useState(() =>
    Math.min(1, (video.durationSeconds > 0 ? 15 : 1) / Math.max(video.durationSeconds, 1))
  );
  // The scrubber's own position — independent of the two trim handles, but
  // always clamped inside [start, end] since previewing outside the
  // selected range isn't a meaningful preview of the clip being created.
  const [playheadFraction, setPlayheadFraction] = useState(0);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const createClip = useClipsStore((s) => s.createClip);

  useEscapeToClose(open, onClose);

  const duration = video.durationSeconds;
  const startSeconds = startFraction * duration;
  const endSeconds = endFraction * duration;
  const clipLength = endSeconds - startSeconds;
  const minGapFraction = duration > 0 ? MIN_CLIP_SECONDS / duration : 0;
  const maxGapFraction = duration > 0 ? MAX_CLIP_SECONDS / duration : 1;

  // Drives the preview <video>'s currentTime — called any time the
  // playhead, or a trim handle standing in for it, moves. Seeking a plain
  // <video> element is how the frame preview updates; there's no playback
  // here, just scrub-to-seek.
  function previewAt(fraction: number) {
    setPlayheadFraction(fraction);
    const el = videoRef.current;
    if (el && duration > 0) el.currentTime = fraction * duration;
  }

  function fractionFromClientX(clientX: number): number {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  }

  function handleStartMove(e: React.PointerEvent<HTMLDivElement>) {
    // Without this, the move bubbles up to the track div's own
    // onPointerMove (handlePlayheadMove) and clamps against last render's
    // startFraction/endFraction — both handlers would fire for the same
    // event, and whichever runs second wins, fighting this one's own seek.
    e.stopPropagation();
    const f = fractionFromClientX(e.clientX);
    const min = 0;
    const max = endFraction - minGapFraction;
    const clamped = Math.min(Math.max(f, min), Math.max(min, max));
    // Sliding start past the max clip length just drags end along with it,
    // rather than refusing the gesture — feels natural for a range selector.
    setStartFraction(clamped);
    if (endFraction - clamped > maxGapFraction) setEndFraction(clamped + maxGapFraction);
    previewAt(clamped);
  }

  function handleEndMove(e: React.PointerEvent<HTMLDivElement>) {
    e.stopPropagation(); // see handleStartMove's comment
    const f = fractionFromClientX(e.clientX);
    const min = startFraction + minGapFraction;
    const max = 1;
    const clamped = Math.min(Math.max(f, min), max);
    setEndFraction(clamped);
    if (clamped - startFraction > maxGapFraction) setStartFraction(clamped - maxGapFraction);
    previewAt(clamped);
  }

  function handlePlayheadMove(e: React.PointerEvent<HTMLDivElement>) {
    const f = fractionFromClientX(e.clientX);
    previewAt(Math.min(Math.max(f, startFraction), endFraction));
  }

  // Tapping/dragging anywhere on the track background (not one of the
  // three handles) scrubs the playhead directly to that point — the actual
  // "scrub" interaction, rather than only being able to move the trim
  // boundaries themselves.
  function handleTrackScrub(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    const f = fractionFromClientX(e.clientX);
    previewAt(Math.min(Math.max(f, startFraction), endFraction));
  }

  // stopPropagation here matters: all three handles sit inside the track
  // div that now also handles tap-to-scrub (handleTrackScrub) — without
  // this, pressing down on a handle would also fire the track's own
  // pointerdown and jump the playhead to that exact spot before the drag
  // even starts.
  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  async function handleCreate() {
    if (clipLength < MIN_CLIP_SECONDS) {
      setError(`Clips need to be at least ${MIN_CLIP_SECONDS} second long.`);
      return;
    }
    setSaving(true);
    setError("");
    const ok = await createClip({
      videoId: video.id,
      startSeconds,
      endSeconds,
      title: title.trim() || undefined,
    });
    setSaving(false);
    if (!ok) {
      setError("Couldn't create that clip. Try again.");
      return;
    }
    onClose();
    setTitle("");
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-bg/70 backdrop-blur-sm z-[60]"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Create a clip"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={SHEET_SPRING}
            className="fixed inset-x-0 bottom-0 z-[61] flex flex-col bg-card border-t border-border rounded-t-2xl md:max-w-md md:left-auto md:right-6 md:bottom-6 md:rounded-2xl md:border"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.25rem)" }}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="text-sm font-semibold flex items-center gap-1.5">
                <Scissors size={15} className="text-primary" />
                Create a clip
              </h2>
              <button
                onClick={onClose}
                aria-label="Close"
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-bg transition-colors shrink-0"
              >
                <X size={16} />
              </button>
            </div>

            <div className="px-5 py-4 flex flex-col gap-4">
              <video
                ref={videoRef}
                src={video.playbackUrl}
                poster={video.posterUrl}
                muted
                playsInline
                preload="metadata"
                onLoadedMetadata={(e) => {
                  e.currentTarget.currentTime = startSeconds;
                }}
                className="w-full aspect-video rounded-xl bg-bg object-contain"
              />

              <div className="flex items-center justify-between text-xs text-text-secondary">
                <span>{formatTimestamp(startSeconds)}</span>
                <span className="font-medium text-accent">{formatTimestamp(clipLength)} clip</span>
                <span>{formatTimestamp(endSeconds)}</span>
              </div>

              <div
                ref={trackRef}
                onPointerDown={handleTrackScrub}
                onPointerMove={(e) => e.buttons === 1 && handlePlayheadMove(e)}
                className="relative h-8 flex items-center touch-none cursor-pointer"
              >
                <div className="absolute inset-x-0 h-1.5 rounded-full bg-bg" />
                <div
                  className="absolute h-1.5 rounded-full bg-primary"
                  style={{ left: `${startFraction * 100}%`, right: `${(1 - endFraction) * 100}%` }}
                />
                {/* Purely a visual readout of previewAt()'s last position —
                    not its own control (the track div's pointer handlers
                    are what's actually draggable), so no slider role here;
                    that would claim keyboard operability this has none of. */}
                <div
                  aria-hidden="true"
                  className="absolute w-0.5 h-6 bg-white -translate-x-1/2 pointer-events-none"
                  style={{ left: `${playheadFraction * 100}%` }}
                />
                <div
                  onPointerDown={handlePointerDown}
                  onPointerMove={(e) => e.buttons === 1 && handleStartMove(e)}
                  className="absolute w-5 h-5 rounded-full bg-accent border-2 border-primary -translate-x-1/2 cursor-grab active:cursor-grabbing"
                  style={{ left: `${startFraction * 100}%` }}
                  role="slider"
                  aria-label="Clip start"
                  aria-valuemin={0}
                  aria-valuemax={duration}
                  aria-valuenow={startSeconds}
                />
                <div
                  onPointerDown={handlePointerDown}
                  onPointerMove={(e) => e.buttons === 1 && handleEndMove(e)}
                  className="absolute w-5 h-5 rounded-full bg-accent border-2 border-primary -translate-x-1/2 cursor-grab active:cursor-grabbing"
                  style={{ left: `${endFraction * 100}%` }}
                  role="slider"
                  aria-label="Clip end"
                  aria-valuemin={0}
                  aria-valuemax={duration}
                  aria-valuenow={endSeconds}
                />
              </div>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-text-secondary">Title (optional)</span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={saving}
                  maxLength={80}
                  placeholder="What's happening in this moment?"
                  className="bg-bg border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary transition-colors disabled:opacity-50"
                />
              </label>

              {error && (
                <p role="alert" className="text-xs text-primary">
                  {error}
                </p>
              )}

              <button
                onClick={handleCreate}
                disabled={saving}
                className="w-full py-2.5 rounded-full bg-primary text-bg text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40"
              >
                {saving && <Loader2 size={16} className="animate-spin" />}
                {saving ? "Creating…" : "Create clip"}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
