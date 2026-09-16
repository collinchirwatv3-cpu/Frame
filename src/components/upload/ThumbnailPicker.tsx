"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Loader2, Type } from "lucide-react";
import { cn } from "@/lib/utils";
import { compositeThumbnail } from "@/lib/thumbnail-canvas";

type Props = {
  videoId: string;
  durationSeconds: number;
  posterUrl: string;
  onDone: (posterUrl: string) => void;
  onSkip: () => void;
};

type Pct = { xPct: number; yPct: number };

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

/**
 * The thumbnail step between "encoding finished" and "published" — pick an
 * exact frame from the real video (built server-side from Cloudflare
 * Stream's own `?time=` thumbnail endpoint, nothing client-supplied is ever
 * trusted as a URL), with an optional draggable text overlay. There is
 * deliberately no "upload your own image" option — an arbitrary custom
 * graphic as a thumbnail is exactly the clickbait mechanic FRAME is trying
 * not to be; every thumbnail traces back to a real frame of the video
 * itself. See /api/uploads/thumbnail for the write side.
 */
export function ThumbnailPicker({ videoId, durationSeconds, posterUrl, onDone, onSkip }: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Text overlay.
  const [textEnabled, setTextEnabled] = useState(false);
  const [text, setText] = useState("");
  const [textPos, setTextPos] = useState<Pct>({ xPct: 0.5, yPct: 0.82 });
  const textDrag = useRef<{ start: { x: number; y: number }; startPos: Pct } | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  function handleTextPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    textDrag.current = { start: { x: e.clientX, y: e.clientY }, startPos: textPos };
  }
  function handleTextPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!textDrag.current || !previewRef.current) return;
    const rect = previewRef.current.getBoundingClientRect();
    const dx = (e.clientX - textDrag.current.start.x) / rect.width;
    const dy = (e.clientY - textDrag.current.start.y) / rect.height;
    setTextPos({
      xPct: clamp(textDrag.current.startPos.xPct + dx, 0.05, 0.95),
      yPct: clamp(textDrag.current.startPos.yPct + dy, 0.08, 0.92),
    });
  }
  function handleTextPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (textDrag.current) e.currentTarget.releasePointerCapture(e.pointerId);
    textDrag.current = null;
  }

  const textOverlayNode = textEnabled && text.trim() && (
    <div
      onPointerDown={handleTextPointerDown}
      onPointerMove={handleTextPointerMove}
      onPointerUp={handleTextPointerUp}
      className="absolute -translate-x-1/2 -translate-y-1/2 px-3 py-1.5 rounded-md bg-black/55 text-white font-extrabold text-center cursor-grab active:cursor-grabbing select-none touch-none"
      style={{ left: `${textPos.xPct * 100}%`, top: `${textPos.yPct * 100}%`, fontSize: "clamp(11px, 3.4vw, 22px)" }}
    >
      {text}
    </div>
  );

  const [pendingTime, setPendingTime] = useState(() => Math.round(durationSeconds / 2));
  const [frameTime, setFrameTime] = useState<number | null>(null);
  const scrubDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleScrub(value: number) {
    setPendingTime(value);
    if (scrubDebounce.current) clearTimeout(scrubDebounce.current);
    scrubDebounce.current = setTimeout(() => setFrameTime(value), 120);
  }
  useEffect(() => () => {
    if (scrubDebounce.current) clearTimeout(scrubDebounce.current);
  }, []);

  const frameSrc =
    frameTime === null ? posterUrl : `${posterUrl}?time=${frameTime.toFixed(2)}s&height=480`;

  async function submitImage(blob: Blob) {
    const form = new FormData();
    form.append("videoId", videoId);
    form.append("image", blob, "thumbnail.jpg");
    const res = await fetch("/api/uploads/thumbnail", { method: "POST", body: form });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.error ?? "Could not save the thumbnail");
    onDone(body.posterUrl);
  }

  async function confirmFrame() {
    setSaving(true);
    setError(null);
    try {
      if (textEnabled && text.trim()) {
        const blob = await compositeThumbnail(frameSrc, {
          text: { text: text.trim(), xPct: textPos.xPct, yPct: textPos.yPct, fontSizePct: 0.09 },
        });
        await submitImage(blob);
      } else {
        const res = await fetch("/api/uploads/thumbnail", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ videoId, timeSeconds: frameTime ?? pendingTime }),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error ?? "Could not save the thumbnail");
        onDone(body.posterUrl);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? `${err.message}${textEnabled ? " — try turning off the text overlay." : ""}`
          : "Something went wrong"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto px-6 py-8">
      <h2 className="text-lg font-semibold mb-1">Choose a thumbnail</h2>
      <p className="text-text-secondary text-sm mb-5">
        Pick a frame from the video. This is what people see before they press play.
      </p>

      <div>
        <div
          ref={previewRef}
          className="relative rounded-2xl overflow-hidden bg-card border border-border aspect-video"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- editor surface needs direct pixel/canvas access, not next/image's optimization pipeline */}
          <img src={frameSrc} alt="" className="w-full h-full object-cover" />
          {textOverlayNode}
        </div>
        <input
          type="range"
          min={0}
          max={Math.max(1, Math.floor(durationSeconds))}
          value={pendingTime}
          onChange={(e) => handleScrub(Number(e.target.value))}
          className="w-full mt-3 accent-primary"
          aria-label="Scrub to a frame"
        />
      </div>

      <div className="flex items-center gap-2 mt-4">
        <button
          type="button"
          onClick={() => setTextEnabled((v) => !v)}
          className={cn(
            "flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold border transition-colors",
            textEnabled
              ? "bg-primary/10 border-primary text-primary"
              : "border-border text-text-secondary hover:text-accent"
          )}
        >
          <Type size={13} />
          Add text
        </button>
        {textEnabled && (
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Title card text"
            maxLength={40}
            className="flex-1 bg-card border border-border rounded-full px-4 py-2 text-xs outline-none focus:border-primary transition-colors"
          />
        )}
      </div>
      {textEnabled && (
        <p className="text-[11px] text-text-secondary mt-1.5">Drag the text on the preview to reposition it.</p>
      )}

      {error && <p className="text-xs text-primary mt-3">{error}</p>}

      <div className="flex gap-3 mt-6">
        <button
          type="button"
          onClick={onSkip}
          disabled={saving}
          className="flex-1 py-2.5 rounded-full border border-border text-sm font-medium hover:bg-card transition-colors disabled:opacity-40"
        >
          Skip for now
        </button>
        <button
          type="button"
          onClick={confirmFrame}
          disabled={saving}
          className="flex-1 py-2.5 rounded-full bg-primary text-bg text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-70"
        >
          {saving && <Loader2 size={16} className="animate-spin" />}
          {saving ? "Saving…" : "Use this thumbnail"}
        </button>
      </div>
    </div>
  );
}
