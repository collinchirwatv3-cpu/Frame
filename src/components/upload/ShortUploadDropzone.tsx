"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Upload as TusUpload } from "tus-js-client";
import { AlertCircle, CheckCircle2, Loader2, UploadCloud, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { categories } from "@/lib/mock-data";
import { checkShortUpload } from "@/lib/video-validation";
import { deriveTitleFromFilename } from "@/lib/upload";
import { createClient } from "@/lib/supabase/client";
import { useEscapeToClose } from "@/lib/use-escape-to-close";
import type { Category } from "@/lib/types";

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

const VIDEO_EXTENSION = /\.(mp4|mov|m4v|webm|avi|mkv|3gp|mts|m2ts|wmv|flv|ogv)$/i;
function looksLikeVideo(file: File) {
  return file.type.startsWith("video/") || VIDEO_EXTENSION.test(file.name);
}

const POLL_INTERVAL_MS = 3000;

/**
 * Shorts skip everything checkUpload/UploadDropzone does for the cinematic
 * film library — no ratio banding, no rotate/crop recovery UI. The only
 * bar is "is it landscape" (checkShortUpload); this exists as its own
 * component rather than a mode inside UploadDropzone because that pipeline
 * is built around ratio-banding/rotate-crop recovery flows shorts don't
 * need at all — shorts just need one clean yes/no. Publishes through the
 * same /api/uploads + Cloudflare Stream pipeline, just with
 * contentType: "short".
 */
export function ShortUploadDropzone({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState<Status>("idle");
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [dims, setDims] = useState<{ width: number; height: number; duration: number } | null>(
    null
  );
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<Category>(categories[0]);
  const [fileName, setFileName] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const tusUploadRef = useRef<TusUpload | null>(null);

  // Always "open" while mounted (no open prop — the parent conditionally
  // renders this at all) — same onClose the X button already uses, no
  // additional guard against closing mid-upload beyond what that button has.
  useEscapeToClose(true, onClose);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
    const url = URL.createObjectURL(pickedFile);
    const probeEl = document.createElement("video");
    probeEl.preload = "metadata";
    probeEl.src = url;

    probeEl.onloadedmetadata = () => {
      const { videoWidth: width, videoHeight: height, duration } = probeEl;
      URL.revokeObjectURL(url);
      const result = checkShortUpload(width, height);
      if (!result.ok) {
        setStatus("rejected");
        return;
      }
      setFile(pickedFile);
      setDims({ width, height, duration });
      if (!title) {
        const derived = deriveTitleFromFilename(pickedFile.name);
        if (derived) setTitle(derived);
      }
      setStatus("valid");
    };

    probeEl.onerror = () => {
      URL.revokeObjectURL(url);
      setStatus("unsupported");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleFiles(files: FileList | null) {
    const picked = files?.[0];
    if (picked) analyzeFile(picked);
  }

  function reset() {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    setStatus("idle");
    setFile(null);
    setDims(null);
    setFileName("");
    setUploadProgress(0);
    setVideoId(null);
    setErrorMessage("");
    if (inputRef.current) inputRef.current.value = "";
  }

  function pollForReady(id: string) {
    const supabase = createClient();
    pollIntervalRef.current = setInterval(async () => {
      const { data, error } = await supabase
        .from("videos")
        .select("processing_status")
        .eq("id", id)
        .single();
      if (error) return;
      if (data.processing_status === "ready") {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        setStatus("published");
      } else if (data.processing_status === "failed") {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        setErrorMessage("Cloudflare Stream couldn't encode this video.");
        setStatus("failed");
      }
    }, POLL_INTERVAL_MS);
  }

  async function publish() {
    if (!file || !dims || !title.trim()) return;
    setStatus("minting");
    setErrorMessage("");

    try {
      const res = await fetch("/api/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          category,
          contentType: "short",
          width: dims.width,
          height: dims.height,
          durationSeconds: dims.duration,
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

  const content = (() => {
    if (status === "published") {
      return (
        <div className="flex flex-col items-center justify-center gap-4 h-full text-center px-6">
          <CheckCircle2 size={48} className="text-primary" />
          <h2 className="text-lg font-bold">Your short is live</h2>
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-full bg-primary text-bg text-sm font-semibold"
          >
            Done
          </button>
        </div>
      );
    }

    if (status === "uploading") {
      return (
        <div className="flex flex-col items-center justify-center gap-4 h-full text-center px-6">
          <div className="w-full max-w-xs">
            <div className="flex justify-between text-xs text-text-secondary mb-2">
              <span>Uploading</span>
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
            className="mt-2 flex items-center gap-1.5 px-5 py-2.5 rounded-full border border-border text-sm font-medium"
          >
            <X size={14} />
            Cancel
          </button>
        </div>
      );
    }

    if (status === "processing") {
      return (
        <div className="flex flex-col items-center justify-center gap-4 h-full text-center px-6">
          <Loader2 size={36} className="animate-spin text-primary" />
          <p className="text-sm text-text-secondary">Encoding your short…</p>
        </div>
      );
    }

    if (status === "failed") {
      return (
        <div className="flex flex-col items-center justify-center gap-3 text-center h-full px-6">
          <AlertCircle size={36} className="text-primary" />
          <p className="text-sm text-text-secondary max-w-sm">
            {errorMessage || "Something went wrong."}
          </p>
          <button
            onClick={reset}
            className="mt-2 px-5 py-2.5 rounded-full border border-border text-sm font-medium"
          >
            Try again
          </button>
        </div>
      );
    }

    if (status === "unsupported") {
      return (
        <div className="flex flex-col items-center justify-center gap-3 text-center h-full px-6">
          <AlertCircle size={36} className="text-primary" />
          <p className="text-sm text-text-secondary max-w-sm">
            {fileName ? `"${fileName}" ` : "That file "}
            doesn&apos;t look like a playable video.
          </p>
          <button
            onClick={reset}
            className="mt-2 px-5 py-2.5 rounded-full border border-border text-sm font-medium"
          >
            Try another file
          </button>
        </div>
      );
    }

    if (status === "rejected") {
      return (
        <div className="flex flex-col items-center justify-center gap-3 text-center h-full px-6">
          <AlertCircle size={36} className="text-primary" />
          <p className="text-sm font-medium">That video is portrait</p>
          <p className="text-xs text-text-secondary max-w-sm">Shorts are landscape only, same as films.</p>
          <button
            onClick={reset}
            className="mt-2 px-5 py-2.5 rounded-full border border-border text-sm font-medium"
          >
            Try another file
          </button>
        </div>
      );
    }

    if (status === "reading") {
      return (
        <div className="flex flex-col items-center justify-center gap-3 h-full text-center px-6">
          <Loader2 size={28} className="animate-spin text-primary" />
        </div>
      );
    }

    if (status === "valid" || status === "minting") {
      return (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            publish();
          }}
          className="flex flex-col gap-4 px-6 py-6 max-w-sm mx-auto w-full"
        >
          <div>
            <label className="text-sm font-medium mb-1.5 block">Title</label>
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              placeholder="Give your short a title"
              className="w-full bg-card border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary transition-colors"
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as Category)}
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
              className="flex-1 py-2.5 rounded-full border border-border text-sm font-medium disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={status === "minting"}
              className="flex-1 py-2.5 rounded-full bg-primary text-bg text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-70"
            >
              {status === "minting" && <Loader2 size={16} className="animate-spin" />}
              {status === "minting" ? "Starting…" : "Post short"}
            </button>
          </div>
        </form>
      );
    }

    return (
      <div
        role="button"
        tabIndex={0}
        aria-label="Choose a landscape video to upload as a short"
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
          "m-6 border-2 border-dashed rounded-2xl flex-1 flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          dragOver ? "border-primary bg-primary/5" : "border-border bg-card/40"
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <UploadCloud size={28} className="text-text-secondary" />
        <p className="text-sm font-medium">Drag & drop, or tap to browse</p>
        <p className="text-xs text-text-secondary">Landscape video, any length</p>
      </div>
    );
  })();

  return (
    <div role="dialog" aria-modal="true" aria-label="New short" className="fixed inset-0 z-[80] bg-bg flex flex-col">
      <div className="flex items-center justify-between px-5 pt-5 pb-2">
        <h2 className="text-base font-semibold">New short</h2>
        <button
          onClick={onClose}
          aria-label="Close"
          className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-card transition-colors"
        >
          <X size={18} />
        </button>
      </div>
      <div className="flex-1 flex flex-col">{content}</div>
    </div>
  );
}
