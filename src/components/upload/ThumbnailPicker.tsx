"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Loader2, Type, Upload as UploadIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { compositeThumbnail } from "@/lib/thumbnail-canvas";

type Props = {
  videoId: string;
  durationSeconds: number;
  posterUrl: string;
  onDone: (posterUrl: string) => void;
  onSkip: () => void;
};

const TARGET_ASPECT = 16 / 9;
const MAX_ZOOM = 2.5;

type Pct = { xPct: number; yPct: number };

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function computeCropSize(naturalSize: { w: number; h: number }, zoom: number) {
  const imageAspect = naturalSize.w / naturalSize.h;
  const base =
    imageAspect >= TARGET_ASPECT
      ? { wPct: TARGET_ASPECT / imageAspect, hPct: 1 }
      : { wPct: 1, hPct: imageAspect / TARGET_ASPECT };
  return { wPct: base.wPct / zoom, hPct: base.hPct / zoom };
}

/**
 * The thumbnail step between "encoding finished" and "published" — pick an
 * exact frame from the video (built server-side from Cloudflare Stream's
 * own `?time=` thumbnail endpoint, nothing client-supplied is ever trusted
 * as a URL) or upload+crop a custom image, either way with an optional
 * draggable text overlay. See /api/uploads/thumbnail for the write side.
 */
export function ThumbnailPicker({ videoId, durationSeconds, posterUrl, onDone, onSkip }: Props) {
  const [tab, setTab] = useState<"frame" | "upload">("frame");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Text overlay — shared between both tabs.
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

  // ---------------------------------------------------------------------
  // Frame tab
  // ---------------------------------------------------------------------
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
          ? `${err.message}${textEnabled ? " — try turning off the text overlay, or upload your own image instead." : ""}`
          : "Something went wrong"
      );
    } finally {
      setSaving(false);
    }
  }

  // ---------------------------------------------------------------------
  // Upload tab
  // ---------------------------------------------------------------------
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [cropPos, setCropPos] = useState<Pct>({ xPct: 0, yPct: 0 });
  const cropDrag = useRef<{ start: { x: number; y: number }; startPos: Pct } | null>(null);

  useEffect(() => {
    return () => {
      if (uploadedUrl) URL.revokeObjectURL(uploadedUrl);
    };
  }, [uploadedUrl]);

  function pickFile(file: File | undefined) {
    if (!file) return;
    if (uploadedUrl) URL.revokeObjectURL(uploadedUrl);
    setUploadedUrl(URL.createObjectURL(file));
    setNaturalSize(null);
    setZoom(1);
    setCropPos({ xPct: 0, yPct: 0 });
    setError(null);
  }

  const cropSize = useMemo(
    () => (naturalSize ? computeCropSize(naturalSize, zoom) : null),
    [naturalSize, zoom]
  );

  function handleZoomChange(nextZoom: number) {
    setZoom(nextZoom);
    if (!naturalSize) return;
    const nextCropSize = computeCropSize(naturalSize, nextZoom);
    setCropPos((prev) => ({
      xPct: clamp(prev.xPct, 0, Math.max(0, 1 - nextCropSize.wPct)),
      yPct: clamp(prev.yPct, 0, Math.max(0, 1 - nextCropSize.hPct)),
    }));
  }

  function handleCropPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!cropSize) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    cropDrag.current = { start: { x: e.clientX, y: e.clientY }, startPos: cropPos };
  }
  function handleCropPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!cropDrag.current || !cropSize || !imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const dx = (e.clientX - cropDrag.current.start.x) / rect.width;
    const dy = (e.clientY - cropDrag.current.start.y) / rect.height;
    setCropPos({
      xPct: clamp(cropDrag.current.startPos.xPct + dx, 0, Math.max(0, 1 - cropSize.wPct)),
      yPct: clamp(cropDrag.current.startPos.yPct + dy, 0, Math.max(0, 1 - cropSize.hPct)),
    });
  }
  function handleCropPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (cropDrag.current) e.currentTarget.releasePointerCapture(e.pointerId);
    cropDrag.current = null;
  }

  async function submitImage(blob: Blob) {
    const form = new FormData();
    form.append("videoId", videoId);
    form.append("image", blob, "thumbnail.jpg");
    const res = await fetch("/api/uploads/thumbnail", { method: "POST", body: form });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.error ?? "Could not save the thumbnail");
    onDone(body.posterUrl);
  }

  async function confirmUpload() {
    if (!uploadedUrl || !cropSize) return;
    setSaving(true);
    setError(null);
    try {
      const blob = await compositeThumbnail(uploadedUrl, {
        crop: { xPct: cropPos.xPct, yPct: cropPos.yPct, wPct: cropSize.wPct, hPct: cropSize.hPct },
        text:
          textEnabled && text.trim()
            ? { text: text.trim(), xPct: textPos.xPct, yPct: textPos.yPct, fontSizePct: 0.09 }
            : undefined,
      });
      await submitImage(blob);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  const canConfirm = tab === "frame" ? true : Boolean(uploadedUrl && cropSize);

  return (
    <div className="max-w-lg mx-auto px-6 py-8">
      <h2 className="text-lg font-semibold mb-1">Choose a thumbnail</h2>
      <p className="text-text-secondary text-sm mb-5">
        Pick a frame from the video, or upload your own image. This is what people see before they
        press play.
      </p>

      <div className="inline-flex items-center gap-1 p-1 rounded-full bg-card border border-border mb-4">
        {(["frame", "upload"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "px-4 py-1.5 rounded-full text-xs font-semibold transition-colors",
              tab === t ? "bg-primary text-bg" : "text-text-secondary hover:text-accent"
            )}
          >
            {t === "frame" ? "Pick a frame" : "Upload your own"}
          </button>
        ))}
      </div>

      {tab === "frame" && (
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
      )}

      {tab === "upload" && (
        <div>
          {!uploadedUrl ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full aspect-video rounded-2xl border-2 border-dashed border-border bg-card/40 hover:bg-card/70 flex flex-col items-center justify-center gap-2 text-text-secondary transition-colors"
            >
              <UploadIcon size={26} />
              <span className="text-sm font-medium">Choose an image</span>
            </button>
          ) : (
            <div ref={previewRef} className="relative rounded-2xl overflow-hidden bg-card border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element -- see above */}
              <img
                ref={imgRef}
                src={uploadedUrl}
                alt=""
                className="w-full h-auto block select-none"
                draggable={false}
                onLoad={(e) =>
                  setNaturalSize({
                    w: e.currentTarget.naturalWidth,
                    h: e.currentTarget.naturalHeight,
                  })
                }
              />
              {cropSize && (
                <div
                  onPointerDown={handleCropPointerDown}
                  onPointerMove={handleCropPointerMove}
                  onPointerUp={handleCropPointerUp}
                  className="absolute border-2 border-primary cursor-grab active:cursor-grabbing touch-none"
                  style={{
                    left: `${cropPos.xPct * 100}%`,
                    top: `${cropPos.yPct * 100}%`,
                    width: `${cropSize.wPct * 100}%`,
                    height: `${cropSize.hPct * 100}%`,
                  }}
                />
              )}
              {textOverlayNode}
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0])}
          />
          {uploadedUrl && (
            <div className="flex items-center gap-3 mt-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-xs text-text-secondary underline underline-offset-2"
              >
                Change image
              </button>
              <label className="flex items-center gap-2 text-xs text-text-secondary flex-1">
                Zoom
                <input
                  type="range"
                  min={1}
                  max={MAX_ZOOM}
                  step={0.05}
                  value={zoom}
                  onChange={(e) => handleZoomChange(Number(e.target.value))}
                  className="flex-1 accent-primary"
                />
              </label>
            </div>
          )}
        </div>
      )}

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
          onClick={tab === "frame" ? confirmFrame : confirmUpload}
          disabled={saving || !canConfirm}
          className="flex-1 py-2.5 rounded-full bg-primary text-bg text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-70"
        >
          {saving && <Loader2 size={16} className="animate-spin" />}
          {saving ? "Saving…" : "Use this thumbnail"}
        </button>
      </div>
    </div>
  );
}
