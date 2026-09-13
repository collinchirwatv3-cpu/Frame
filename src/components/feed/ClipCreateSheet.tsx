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
 * single-thumb scrub bar (pointer capture + getBoundingClientRect fraction). */
export function ClipCreateSheet({ video, open, onClose }: { video: Video; open: boolean; onClose: () => void }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [startFraction, setStartFraction] = useState(0);
  const [endFraction, setEndFraction] = useState(() =>
    Math.min(1, (video.durationSeconds > 0 ? 15 : 1) / Math.max(video.durationSeconds, 1))
  );
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

  function fractionFromClientX(clientX: number): number {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  }

  function handleStartMove(e: React.PointerEvent<HTMLDivElement>) {
    const f = fractionFromClientX(e.clientX);
    const min = 0;
    const max = endFraction - minGapFraction;
    const clamped = Math.min(Math.max(f, min), Math.max(min, max));
    // Sliding start past the max clip length just drags end along with it,
    // rather than refusing the gesture — feels natural for a range selector.
    setStartFraction(clamped);
    if (endFraction - clamped > maxGapFraction) setEndFraction(clamped + maxGapFraction);
  }

  function handleEndMove(e: React.PointerEvent<HTMLDivElement>) {
    const f = fractionFromClientX(e.clientX);
    const min = startFraction + minGapFraction;
    const max = 1;
    const clamped = Math.min(Math.max(f, min), max);
    setEndFraction(clamped);
    if (clamped - startFraction > maxGapFraction) setStartFraction(clamped - maxGapFraction);
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
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
              <div className="flex items-center justify-between text-xs text-text-secondary">
                <span>{formatTimestamp(startSeconds)}</span>
                <span className="font-medium text-accent">{formatTimestamp(clipLength)} clip</span>
                <span>{formatTimestamp(endSeconds)}</span>
              </div>

              <div ref={trackRef} className="relative h-8 flex items-center touch-none">
                <div className="absolute inset-x-0 h-1.5 rounded-full bg-bg" />
                <div
                  className="absolute h-1.5 rounded-full bg-primary"
                  style={{ left: `${startFraction * 100}%`, right: `${(1 - endFraction) * 100}%` }}
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
