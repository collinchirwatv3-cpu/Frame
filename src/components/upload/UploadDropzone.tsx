"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Upload as TusUpload } from "tus-js-client";
import {
  AlertCircle,
  CheckCircle2,
  Film,
  Loader2,
  RectangleHorizontal,
  UploadCloud,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { categories } from "@/lib/mock-data";
import { checkUpload, qualityLabel, type UploadCheck } from "@/lib/video-validation";
import { deriveTitleFromFilename } from "@/lib/upload";
import { useUploadDraftStore } from "@/store/upload-draft-store";
import { createClient } from "@/lib/supabase/client";
import { UploadRejection } from "./UploadRejection";
import type { AspectRatioDef } from "@/lib/aspect-ratio";

type Status =
  | "idle"
  | "reading"
  | "rejected"
  | "unsupported"
  | "valid"
  | "minting"
  | "uploading"
  | "processing"
  | "failed"
  | "published";

// `file.type` is frequently empty or unreliable on mobile — Android content
// resolvers (Google Photos, some file managers) often hand back a File with
// no MIME type even though the OS picker only showed video files. Falling
// back to the extension avoids silently dropping a real video pick.
const VIDEO_EXTENSION = /\.(mp4|mov|m4v|webm|avi|mkv|3gp)$/i;
function looksLikeVideo(file: File) {
  return file.type.startsWith("video/") || VIDEO_EXTENSION.test(file.name);
}

// How often to check whether Stream's webhook has flipped the video to
// ready/failed while the creator waits on the "processing" screen.
const POLL_INTERVAL_MS = 3000;

type Probe = {
  width: number;
  height: number;
  duration: number;
  url: string;
};

type AppliedFix = { type: "rotate" } | { type: "crop"; target: AspectRatioDef } | null;

export function UploadDropzone() {
  const [status, setStatus] = useState<Status>("idle");
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [probe, setProbe] = useState<Probe | null>(null);
  const [effectiveDims, setEffectiveDims] = useState<{ width: number; height: number } | null>(
    null
  );
  const [check, setCheck] = useState<UploadCheck | null>(null);
  const [appliedFix, setAppliedFix] = useState<AppliedFix>(null);
  const [fileName, setFileName] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const tusUploadRef = useRef<TusUpload | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const hasHydrated = useUploadDraftStore((s) => s.hasHydrated);
  const draftTitle = useUploadDraftStore((s) => s.title);
  const draftDescription = useUploadDraftStore((s) => s.description);
  const draftCategory = useUploadDraftStore((s) => s.category);
  const setDraftTitle = useUploadDraftStore((s) => s.setTitle);
  const setDraftDescription = useUploadDraftStore((s) => s.setDescription);
  const setDraftCategory = useUploadDraftStore((s) => s.setCategory);
  const clearDraft = useUploadDraftStore((s) => s.clearDraft);
  // No real per-creator upload history exists yet (that's Milestone 2 —
  // real video data replacing mock-data.ts) to derive a smarter default from.
  const category = draftCategory ?? categories[0];

  // Pre-fill the title from the filename the moment the upload validates —
  // one fewer required action before a creator can publish. Only seeds an
  // empty title, never overwrites something the creator already typed.
  useEffect(() => {
    if (status === "valid" && hasHydrated && !draftTitle) {
      const derived = deriveTitleFromFilename(fileName);
      if (derived) setDraftTitle(derived);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, hasHydrated]);

  // Stop polling if the creator navigates away mid-encode.
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  const analyzeFile = useCallback((pickedFile: File) => {
    setFileName(pickedFile.name);

    if (!looksLikeVideo(pickedFile)) {
      setStatus("unsupported");
      return;
    }

    setStatus("reading");
    setAppliedFix(null);

    const url = URL.createObjectURL(pickedFile);
    const probeEl = document.createElement("video");
    probeEl.preload = "metadata";
    probeEl.src = url;

    probeEl.onloadedmetadata = () => {
      const { videoWidth: width, videoHeight: height, duration } = probeEl;
      setFile(pickedFile);
      setProbe({ width, height, duration, url });
      setEffectiveDims({ width, height });
      const result = checkUpload(width, height);
      setCheck(result);
      setStatus(result.ok ? "valid" : "rejected");
    };

    probeEl.onerror = () => {
      URL.revokeObjectURL(url);
      setStatus("unsupported");
      setProbe(null);
    };
  }, []);

  function handleFiles(files: FileList | null) {
    const picked = files?.[0];
    if (picked) analyzeFile(picked);
  }

  function reset() {
    if (probe) URL.revokeObjectURL(probe.url);
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    setStatus("idle");
    setFile(null);
    setProbe(null);
    setEffectiveDims(null);
    setCheck(null);
    setAppliedFix(null);
    setFileName("");
    setUploadProgress(0);
    setVideoId(null);
    setErrorMessage("");
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleAcceptRotate(width: number, height: number) {
    const result = checkUpload(width, height);
    if (!result.ok) return;
    setEffectiveDims({ width, height });
    setCheck(result);
    setAppliedFix({ type: "rotate" });
    setStatus("valid");
  }

  function handleAcceptCrop(target: AspectRatioDef) {
    setCheck({ ok: true, aspect: target });
    setAppliedFix({ type: "crop", target });
    setStatus("valid");
  }

  function pollForReady(id: string) {
    const supabase = createClient();
    pollIntervalRef.current = setInterval(async () => {
      const { data, error } = await supabase
        .from("videos")
        .select("processing_status")
        .eq("id", id)
        .single();

      if (error) return; // transient — try again on the next tick

      if (data.processing_status === "ready") {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        setStatus("published");
        clearDraft();
      } else if (data.processing_status === "failed") {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        setErrorMessage("Cloudflare Stream couldn't encode this video.");
        setStatus("failed");
      }
    }, POLL_INTERVAL_MS);
  }

  async function publish() {
    if (!file || !effectiveDims || !check?.ok) return;
    setStatus("minting");
    setErrorMessage("");

    try {
      const res = await fetch("/api/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draftTitle,
          description: draftDescription,
          category,
          width: effectiveDims.width,
          height: effectiveDims.height,
          durationSeconds: probe?.duration ?? 0,
          fileSizeBytes: file.size,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(
          typeof body?.error === "string" ? body.error : "Could not start the upload"
        );
      }

      const { uploadUrl, videoId: newVideoId } = (await res.json()) as {
        uploadUrl: string;
        videoId: string;
      };
      setVideoId(newVideoId);
      setStatus("uploading");
      setUploadProgress(0);

      const upload = new TusUpload(file, {
        uploadUrl,
        retryDelays: [0, 1000, 3000, 5000, 10000],
        onProgress(bytesUploaded, bytesTotal) {
          setUploadProgress(Math.round((bytesUploaded / bytesTotal) * 100));
        },
        onError(err) {
          setErrorMessage(err.message || "The upload was interrupted.");
          setStatus("failed");
        },
        onSuccess() {
          setStatus("processing");
          if (newVideoId) pollForReady(newVideoId);
        },
      });
      tusUploadRef.current = upload;
      upload.start();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not start the upload");
      setStatus("failed");
    }
  }

  async function cancelUpload() {
    tusUploadRef.current?.abort();
    tusUploadRef.current = null;
    if (videoId) {
      const supabase = createClient();
      await supabase.from("videos").delete().eq("id", videoId);
    }
    setVideoId(null);
    setUploadProgress(0);
    setStatus("valid");
  }

  if (status === "published") {
    return (
      <div className="flex flex-col items-center justify-center gap-4 h-[60vh] text-center px-6">
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 20 }}
        >
          <CheckCircle2 size={56} className="text-primary" />
        </motion.div>
        <h2 className="text-xl font-bold">You&apos;re live on FRAME</h2>
        <p className="text-text-secondary text-sm max-w-sm">{fileName} finished encoding and is ready to watch.</p>
        <div className="flex gap-3 mt-2">
          {videoId && (
            <a
              href={`/?v=${videoId}`}
              className="px-5 py-2.5 rounded-full bg-primary text-bg text-sm font-semibold"
            >
              Watch it now
            </a>
          )}
          <button
            onClick={reset}
            className="px-5 py-2.5 rounded-full border border-border text-sm font-medium hover:bg-card transition-colors"
          >
            Upload another
          </button>
        </div>
      </div>
    );
  }

  if (status === "uploading") {
    return (
      <div className="flex flex-col items-center justify-center gap-4 h-[60vh] text-center px-6">
        <div className="w-full max-w-xs">
          <div className="flex justify-between text-xs text-text-secondary mb-2">
            <span>Uploading {fileName}</span>
            <span>{uploadProgress}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-card overflow-hidden">
            <div
              className="h-full bg-primary transition-[width] duration-150 ease-linear"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
        <button
          onClick={cancelUpload}
          className="mt-2 flex items-center gap-1.5 px-5 py-2.5 rounded-full border border-border text-sm font-medium hover:bg-card transition-colors"
        >
          <X size={14} />
          Cancel
        </button>
      </div>
    );
  }

  if (status === "processing") {
    return (
      <div className="flex flex-col items-center justify-center gap-4 h-[60vh] text-center px-6">
        <Loader2 size={40} className="animate-spin text-primary" />
        <h2 className="text-lg font-semibold">Encoding your video</h2>
        <p className="text-text-secondary text-sm max-w-sm">
          {fileName} finished uploading and is being transcoded to adaptive HLS. This usually
          takes a few minutes.
        </p>
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 text-center h-[60vh] px-6">
        <AlertCircle size={40} className="text-primary" />
        <h2 className="text-lg font-semibold">Upload failed</h2>
        <p className="text-sm text-text-secondary max-w-sm">
          {errorMessage || "Something went wrong during upload."}
        </p>
        <button
          onClick={reset}
          className="mt-2 px-5 py-2.5 rounded-full border border-border text-sm font-medium hover:bg-card transition-colors"
        >
          Try again
        </button>
      </div>
    );
  }

  if (status === "unsupported") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 text-center h-[60vh] px-6">
        <AlertCircle size={40} className="text-primary" />
        <h2 className="text-lg font-semibold">Couldn&apos;t read that file</h2>
        <p className="text-sm text-text-secondary max-w-sm">
          {fileName ? `"${fileName}" ` : "That file "}
          doesn&apos;t look like a playable video, or uses a format this browser can&apos;t
          preview. Try exporting as MP4 (H.264) and uploading again.
        </p>
        <button
          onClick={reset}
          className="mt-2 px-5 py-2.5 rounded-full border border-border text-sm font-medium hover:bg-card transition-colors"
        >
          Try another file
        </button>
      </div>
    );
  }

  if (status === "rejected" && probe && check && !check.ok) {
    return (
      <UploadRejection
        probe={probe}
        rejection={check}
        onAcceptRotate={handleAcceptRotate}
        onAcceptCrop={handleAcceptCrop}
        onReset={reset}
      />
    );
  }

  if ((status === "valid" || status === "minting") && check?.ok) {
    const dims = appliedFix?.type === "crop" ? null : effectiveDims;

    return (
      <div className="grid md:grid-cols-2 gap-8 px-6 py-8 max-w-4xl mx-auto">
        <div>
          {appliedFix?.type === "rotate" && probe ? (
            <div className="relative w-40 h-64 mx-auto overflow-hidden rounded-2xl bg-card border border-border">
              <video
                src={probe.url}
                controls
                muted
                className="absolute top-1/2 left-1/2 origin-center object-contain"
                style={{ width: 256, height: 160, transform: "translate(-50%, -50%) rotate(90deg)" }}
              />
            </div>
          ) : (
            <div
              className="rounded-2xl overflow-hidden bg-card border border-border"
              style={{
                aspectRatio:
                  appliedFix?.type === "crop" && probe
                    ? probe.width / probe.height
                    : (check.aspect.minRatio + check.aspect.maxRatio) / 2,
              }}
            >
              {probe && (
                <video src={probe.url} className="w-full h-full object-contain" controls muted />
              )}
            </div>
          )}

          {appliedFix && (
            <p className="text-xs text-primary mt-2">
              {appliedFix.type === "rotate"
                ? "This video will be rotated 90° during processing."
                : `This video will be cropped to ${appliedFix.target.label} during processing.`}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-3 text-xs text-text-secondary">
            <span className="flex items-center gap-1 text-primary font-semibold">
              <RectangleHorizontal size={13} /> {check.aspect.label}
            </span>
            {dims && (
              <>
                <span className="flex items-center gap-1 font-medium">
                  <Film size={13} /> {qualityLabel(dims.width, dims.height)}
                </span>
                <span>
                  {dims.width}×{dims.height}
                </span>
              </>
            )}
            {probe && <span>{probe.duration.toFixed(0)}s</span>}
          </div>

          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-[11px] text-text-secondary mb-2">Detected after upload</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-secondary/70">
              <span>FPS —</span>
              <span>Codec —</span>
              <span>Bitrate —</span>
            </div>
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            publish();
          }}
          className="flex flex-col gap-4"
        >
          <div>
            <label className="text-sm font-medium mb-1.5 block">Title</label>
            <input
              required
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              placeholder="Give your video a title"
              className="w-full bg-card border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary transition-colors"
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Description</label>
            <textarea
              rows={3}
              value={draftDescription}
              onChange={(e) => setDraftDescription(e.target.value)}
              placeholder="What are we watching?"
              className="w-full bg-card border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary transition-colors resize-none"
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Category</label>
            <select
              value={category}
              onChange={(e) => setDraftCategory(e.target.value as (typeof categories)[number])}
              className="w-full bg-card border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary transition-colors"
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 mt-2">
            <button
              type="button"
              onClick={reset}
              disabled={status === "minting"}
              className="flex-1 py-2.5 rounded-full border border-border text-sm font-medium hover:bg-card transition-colors disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={status === "minting"}
              className="flex-1 py-2.5 rounded-full bg-primary text-bg text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-70"
            >
              {status === "minting" && <Loader2 size={16} className="animate-spin" />}
              {status === "minting" ? "Starting upload…" : "Publish to FRAME"}
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      <h1 className="text-2xl font-bold mb-1">Upload</h1>
      <p className="text-text-secondary text-sm mb-8">
        Landscape only. FRAME supports 16:9, 21:9 Cinema, and 16:10 — no exceptions, no black
        bars.
      </p>

      <div
        role="button"
        tabIndex={0}
        aria-label="Choose a video file to upload"
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        className={cn(
          "border-2 border-dashed rounded-2xl aspect-video flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          dragOver ? "border-primary bg-primary/5" : "border-border bg-card/40 hover:bg-card/70"
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />

        {status === "reading" ? (
          <>
            <Loader2 size={32} className="animate-spin text-primary" />
            <p className="text-sm text-text-secondary">Checking aspect ratio…</p>
          </>
        ) : (
          <>
            <UploadCloud size={32} className="text-text-secondary" />
            <p className="text-sm font-medium">Drag & drop your video, or click to browse</p>
            <p className="text-xs text-text-secondary">MP4 or MOV · up to 4K · 60fps</p>
          </>
        )}
      </div>
    </div>
  );
}
