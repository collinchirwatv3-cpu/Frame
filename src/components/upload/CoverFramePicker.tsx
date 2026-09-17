"use client";

import { useRef, useState, type RefObject } from "react";
import { Loader2, Type } from "lucide-react";
import { formatTimestamp } from "@/lib/utils";
import { compositeThumbnail } from "@/lib/thumbnail-canvas";

type Props = {
  /** The shared local preview <video> in UploadDropzone (probe.url) — this
   * is what actually gets seeked and captured. Cover frame lives on the
   * same screen as Trim precisely because both work off this one local
   * file, no Cloudflare round trip needed for either. */
  videoRef: RefObject<HTMLVideoElement | null>;
  /** Bounds the position track to the trimmed window — a cover frame from
   * footage that got cut wouldn't correspond to anything a viewer can
   * reach, same reasoning ThumbnailPicker's startSeconds/endSeconds used
   * to apply post-publish. */
  trimStart: number;
  trimEnd: number;
  time: number;
  onTimeChange: (seconds: number) => void;
  textEnabled: boolean;
  onTextEnabledChange: (enabled: boolean) => void;
  text: string;
  onTextChange: (text: string) => void;
  /** Center position of the draggable text overlay (each 0-1), owned by
   * the parent since the overlay itself is rendered there, anchored over
   * the shared preview video — this component only needs the final value
   * at capture time. */
  textPos: { xPct: number; yPct: number };
  onCapture: (blob: Blob) => void;
};

/** Single-handle position track + "Capture cover" button — the reference
 * screenshot's Cover frame panel: drag to a moment, capture that exact
 * frame from the local file via canvas (src/lib/thumbnail-canvas.ts), see
 * a small confirmation swatch. Capturing is a deliberate, explicit action
 * (not "whatever the track is on when you submit") so the creator knows
 * precisely what frame was grabbed. The draggable text-overlay position
 * itself lives one level up (UploadDropzone), anchored over the actual
 * preview video — this component only owns the position track, the
 * text/enabled inputs, and the capture action. */
export function CoverFramePicker({
  videoRef,
  trimStart,
  trimEnd,
  time,
  onTimeChange,
  textEnabled,
  onTextEnabledChange,
  text,
  onTextChange,
  textPos,
  onCapture,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [capturing, setCapturing] = useState(false);
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null);
  const capturedUrlRef = useRef<string | null>(null);

  const min = trimStart;
  const max = Math.max(trimStart, trimEnd, min + 0.01);
  const clampedTime = Math.min(Math.max(time, min), max);
  const positionFraction = (clampedTime - min) / (max - min);

  function fractionFromClientX(clientX: number): number {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  }

  function seekTo(fraction: number) {
    const seconds = min + fraction * (max - min);
    onTimeChange(seconds);
    const el = videoRef.current;
    if (el) el.currentTime = seconds;
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    seekTo(fractionFromClientX(e.clientX));
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (e.buttons === 1) seekTo(fractionFromClientX(e.clientX));
  }

  async function handleCapture() {
    const el = videoRef.current;
    if (!el) return;
    setCapturing(true);
    try {
      const overlay =
        textEnabled && text.trim()
          ? { text: text.trim(), xPct: textPos.xPct, yPct: textPos.yPct, fontSizePct: 0.09 }
          : undefined;
      const blob = await compositeThumbnail(el, { text: overlay });
      if (capturedUrlRef.current) URL.revokeObjectURL(capturedUrlRef.current);
      const url = URL.createObjectURL(blob);
      capturedUrlRef.current = url;
      setCapturedUrl(url);
      onCapture(blob);
    } finally {
      setCapturing(false);
    }
  }

  return (
    <div className="mt-4 rounded-2xl border border-border bg-card/50 px-4 py-3">
      <div className="flex items-center justify-between text-xs mb-2">
        <span className="font-medium">Cover frame</span>
        <output className="tabular-nums text-text-secondary">{formatTimestamp(clampedTime)}</output>
      </div>

      <div
        ref={trackRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        className="relative h-8 flex items-center touch-none cursor-pointer"
      >
        <div className="absolute inset-x-0 h-1.5 rounded-full bg-bg" />
        <div
          className="absolute w-6 h-6 rounded-full bg-accent border-2 border-primary -translate-x-1/2 cursor-grab active:cursor-grabbing touch-none"
          style={{ left: `${positionFraction * 100}%` }}
          role="slider"
          aria-label="Cover frame position"
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={clampedTime}
          aria-valuetext={formatTimestamp(clampedTime)}
        />
      </div>
      <div className="flex justify-between text-[11px] tabular-nums text-text-secondary mt-1">
        <span>{formatTimestamp(min)}</span>
        <span>{formatTimestamp(max)}</span>
      </div>

      <div className="flex items-center gap-2 mt-3">
        <button
          type="button"
          onClick={() => onTextEnabledChange(!textEnabled)}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold border transition-colors shrink-0 ${
            textEnabled ? "bg-primary/10 border-primary text-primary" : "border-border text-text-secondary hover:text-accent"
          }`}
        >
          <Type size={13} />
          Add text
        </button>
        {textEnabled && (
          <input
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            placeholder="Title card text"
            maxLength={40}
            className="flex-1 min-w-0 bg-card border border-border rounded-full px-4 py-2 text-xs outline-none focus:border-primary transition-colors"
          />
        )}
        <button
          type="button"
          onClick={handleCapture}
          disabled={capturing}
          className="ml-auto shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-primary text-bg text-xs font-semibold disabled:opacity-70"
        >
          {capturing && <Loader2 size={13} className="animate-spin" />}
          {capturing ? "Capturing…" : "Capture cover"}
        </button>
      </div>

      {capturedUrl && (
        <div className="flex items-center gap-2 mt-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- a captured local blob, not an optimizable remote image */}
          <img src={capturedUrl} alt="Captured cover frame" className="w-20 aspect-video rounded-lg object-cover border border-border" />
          <span className="text-[11px] text-text-secondary">This frame will be your cover.</span>
        </div>
      )}
    </div>
  );
}
