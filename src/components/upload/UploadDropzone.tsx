"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Upload as TusUpload } from "tus-js-client";
import {
  AlertCircle,
  CheckCircle2,
  Film,
  Loader2,
  RectangleHorizontal,
  UploadCloud,
  Video,
  X,
} from "lucide-react";
import { cn, formatTimestamp } from "@/lib/utils";
import { checkUpload, qualityLabel, type UploadCheck } from "@/lib/video-validation";
import { deriveTitleFromFilename } from "@/lib/upload";
import { SHORTS_MAX_DURATION_SECONDS } from "@/lib/validation/upload";
import { useUploadDraftStore } from "@/store/upload-draft-store";
import { useCurrentUserStore } from "@/store/current-user-store";
import { createClient } from "@/lib/supabase/client";
import { UploadRejection } from "./UploadRejection";
import { CameraCapture } from "./CameraCapture";
import { VideoTrimmer } from "./VideoTrimmer";
import { CoverFramePicker } from "./CoverFramePicker";
import { ContentTypeSelect } from "./tags/ContentTypeSelect";
import { TagMultiSelect } from "./tags/TagMultiSelect";
import { TagDropdownMultiSelect } from "./tags/TagDropdownMultiSelect";
import { LocationPicker } from "./tags/LocationPicker";
import { GearPicker } from "./tags/GearPicker";
import { CollapsibleTagSection } from "./tags/CollapsibleTagSection";
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
// back to the extension avoids silently dropping a real video pick. Covers
// iPhone (mov/m4v, HEVC or H.264 inside), Android (mp4/webm/3gp), and
// prosumer/broadcast camera exports (mts/m2ts AVCHD camcorders, mxf, ts,
// wmv) — not just mp4. This check only gates whether FRAMES attempts to read
// the file at all; whether it can actually preview it locally still depends
// on the browser's own codec support (see analyzeFile's onerror path).
const VIDEO_EXTENSION = /\.(mp4|mov|m4v|webm|avi|mkv|3gp|mts|m2ts|mxf|ts|wmv|flv|ogv)$/i;
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

type Pct = { xPct: number; yPct: number };

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

// A few different film-lab terms for the same underlying step (Stream
// transcoding the upload to adaptive HLS) — one picked per upload rather
// than always "Developing your Frame," so the processing screen reads as
// a working film suite's voice rather than one fixed line of copy. All
// describe the same wait; the body text underneath stays generic so it
// doesn't need to grammatically match whichever one shows.
const PROCESSING_HEADLINES = [
  "Developing your Frame",
  "Processing your dailies",
  "In the lab",
  "Striking your print",
  "Cutting your reel",
];

export function UploadDropzone() {
  const [status, setStatus] = useState<Status>("idle");
  const [processingHeadline] = useState(
    () => PROCESSING_HEADLINES[Math.floor(Math.random() * PROCESSING_HEADLINES.length)]
  );
  const [source, setSource] = useState<"file" | "camera">("file");
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [probe, setProbe] = useState<Probe | null>(null);
  const [effectiveDims, setEffectiveDims] = useState<{ width: number; height: number } | null>(
    null
  );
  const [check, setCheck] = useState<UploadCheck | null>(null);
  const [appliedFix, setAppliedFix] = useState<AppliedFix>(null);
  const [fileName, setFileName] = useState("");
  // Not in useUploadDraftStore with title/description/category — those
  // persist across reloads for a real reason (don't lose typed-out copy
  // mid-upload); this is a lightweight toggle that only ever makes sense
  // once a duration is already probed, no persistence needed.
  const [isLongform, setIsLongform] = useState(false);
  // Same reasoning as isLongform above — a lightweight toggle, not draft
  // state worth persisting across reloads.
  const [publishMode, setPublishMode] = useState<"post" | "promote" | "monetise">("post");
  // Not draft state either, same reasoning as isLongform/publishMode above
  // — only meaningful once a real file is probed, reset with everything
  // else in reset(). Seeded to the full [0, duration] range the moment
  // that duration is known (analyzeFile's onloadedmetadata below).
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  // Cover frame — captured client-side from the same local file/preview as
  // Trim (src/lib/thumbnail-canvas.ts), so it can live on this same
  // pre-upload screen instead of a separate step after Stream processing.
  // coverBlob is optional: if the creator never taps "Capture cover",
  // publish() simply never calls /api/uploads/thumbnail, and Cloudflare's
  // own auto-generated poster applies once the video is ready — same
  // graceful fallback the old post-processing picker's "Skip for now" gave.
  const [coverTime, setCoverTime] = useState(0);
  const [coverBlob, setCoverBlob] = useState<Blob | null>(null);
  // Bumped on reset() to remount CoverFramePicker, clearing its own
  // internal captured-preview state along with everything reset() already
  // clears here.
  const [coverResetKey, setCoverResetKey] = useState(0);
  const [textEnabled, setTextEnabled] = useState(false);
  const [text, setText] = useState("");
  const [textPos, setTextPos] = useState<Pct>({ xPct: 0.5, yPct: 0.82 });
  const textDrag = useRef<{ start: { x: number; y: number }; startPos: Pct } | null>(null);
  const [isApprovedBusiness, setIsApprovedBusiness] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  // Inline, stays on the form — unlike errorMessage above, which only ever
  // shows on the full-screen status==="failed" view for a real upload/
  // encode failure.
  const [tagFormError, setTagFormError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const tusUploadRef = useRef<TusUpload | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const monetizationEligible = useCurrentUserStore((s) => s.monetizationEligible);
  const currentUserId = useCurrentUserStore((s) => s.profile?.id);

  const hasHydrated = useUploadDraftStore((s) => s.hasHydrated);
  const draftTitle = useUploadDraftStore((s) => s.title);
  const draftDescription = useUploadDraftStore((s) => s.description);
  const setDraftTitle = useUploadDraftStore((s) => s.setTitle);
  const setDraftDescription = useUploadDraftStore((s) => s.setDescription);
  const contentTypeTagId = useUploadDraftStore((s) => s.contentTypeTagId);
  const genreTagIds = useUploadDraftStore((s) => s.genreTagIds);
  const topicTagIds = useUploadDraftStore((s) => s.topicTagIds);
  const moodTagIds = useUploadDraftStore((s) => s.moodTagIds);
  const locationTagId = useUploadDraftStore((s) => s.locationTagId);
  const gearTagIds = useUploadDraftStore((s) => s.gearTagIds);
  const setContentTypeTagId = useUploadDraftStore((s) => s.setContentTypeTagId);
  const setGenreTagIds = useUploadDraftStore((s) => s.setGenreTagIds);
  const setTopicTagIds = useUploadDraftStore((s) => s.setTopicTagIds);
  const setMoodTagIds = useUploadDraftStore((s) => s.setMoodTagIds);
  const setLocationTagId = useUploadDraftStore((s) => s.setLocationTagId);
  const setGearTagIds = useUploadDraftStore((s) => s.setGearTagIds);
  const clearDraft = useUploadDraftStore((s) => s.clearDraft);

  // A different table than current-user-store's profile (business_channels
  // isn't part of the profiles row), so it's fetched locally here rather
  // than folded into AuthListener's global hydration — only the upload
  // flow currently cares whether the signed-in user is an approved
  // Business Channel (Promote is hidden for them; they Run as an Ad
  // instead, once that surface exists).
  useEffect(() => {
    if (!currentUserId) return;
    const supabase = createClient();
    supabase
      .from("business_channels")
      .select("status")
      .eq("profile_id", currentUserId)
      .maybeSingle()
      .then(({ data }) => setIsApprovedBusiness(data?.status === "approved"));
  }, [currentUserId]);

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
      setTrimStart(0);
      setTrimEnd(duration);
      setCoverTime(Math.min(duration, duration / 2));
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
    setIsLongform(false);
    setPublishMode("post");
    setTrimStart(0);
    setTrimEnd(0);
    setCoverTime(0);
    setCoverBlob(null);
    setCoverResetKey((k) => k + 1);
    setTextEnabled(false);
    setText("");
    setTextPos({ xPct: 0.5, yPct: 0.82 });
    if (inputRef.current) inputRef.current.value = "";
  }

  // Draggable text-overlay position over the preview video, ported from the
  // old post-processing ThumbnailPicker's identical drag math — now
  // anchored to previewContainerRef instead of a frame <img>, since the
  // capture source is the local preview <video> itself.
  function handleTextPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    textDrag.current = { start: { x: e.clientX, y: e.clientY }, startPos: textPos };
  }
  function handleTextPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!textDrag.current || !previewContainerRef.current) return;
    const rect = previewContainerRef.current.getBoundingClientRect();
    const dx = (e.clientX - textDrag.current.start.x) / rect.width;
    const dy = (e.clientY - textDrag.current.start.y) / rect.height;
    setTextPos({
      xPct: clamp(textDrag.current.startPos.xPct + dx, 0.05, 0.95),
      yPct: clamp(textDrag.current.startPos.yPct + dy, 0.08, 0.92),
    });
  }
  function handleTextPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (textDrag.current) e.currentTarget.releasePointerCapture(e.pointerId);
    textDrag.current = null;
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
        // Cover frame (if any) was already captured and submitted at
        // publish time — nothing left to pick here now that it's ready.
        clearDraft();
        setStatus("published");
      } else if (data.processing_status === "failed") {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        setErrorMessage("Cloudflare Stream couldn't encode this Frame.");
        setStatus("failed");
      }
    }, POLL_INTERVAL_MS);
  }

  async function publish() {
    if (!file || !effectiveDims || !check?.ok) return;
    // contentTypeTagId is also gated by ContentTypeSelect's native
    // `required` <select> (blocks the submit event entirely, same as the
    // title input already relies on) — genre/topic aren't native form
    // controls, so their own min-1 requirement needs an explicit check
    // here instead, matching what the server (api/uploads route) enforces
    // regardless either way. Sets a form-level error, not `status:
    // "failed"` — that's the full-screen failure view for a real upload/
    // encode failure, not a spot to bounce someone to for forgetting a
    // required field while still on the form.
    if (!contentTypeTagId || genreTagIds.length === 0 || topicTagIds.length === 0) {
      setTagFormError("Pick a content type, at least one genre, and at least one topic.");
      return;
    }
    setTagFormError("");
    setStatus("minting");
    setErrorMessage("");

    try {
      const res = await fetch("/api/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draftTitle,
          description: draftDescription,
          contentTypeTagId,
          genreTagIds,
          topicTagIds,
          moodTagIds,
          locationTagId,
          gearTagIds,
          // The server re-derives "short" from duration regardless of what's
          // sent here (never client-trusted for that boundary) — this is
          // only the film-vs-longform choice, and only reachable at all
          // when the LongForm toggle is shown (> 6 minutes).
          contentType: isLongform ? "longform" : "film",
          publishMode,
          width: effectiveDims.width,
          height: effectiveDims.height,
          durationSeconds: probe?.duration ?? 0,
          fileSizeBytes: file.size,
          trimStartSeconds: trimStart,
          trimEndSeconds: trimEnd,
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

      // Fire-and-forget, same tolerance this route already has for the
      // campaigns insert (src/app/api/uploads/route.ts): a captured cover
      // is a nice-to-have, not worth failing the whole publish over. The
      // main video upload below doesn't wait on it either — they run
      // side by side, same as the reference flow shows a progress bar and
      // the cover/trim panels present at once rather than sequentially.
      if (coverBlob) {
        const coverForm = new FormData();
        coverForm.append("videoId", newVideoId);
        coverForm.append("image", coverBlob, "cover.jpg");
        fetch("/api/uploads/thumbnail", { method: "POST", body: coverForm }).catch(() => {});
      }

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
        <h2 className="text-xl font-bold">You&apos;re live on FRAMES</h2>
        <p className="text-text-secondary text-sm max-w-sm">{fileName} finished encoding and is ready to watch.</p>
        <div className="flex gap-3 mt-2">
          {videoId && (
            // /watch/[id], not /?v= — Home is a curated For You/Saved/History
            // feed now (lib/home-feed.ts), not "every public video," so a
            // just-published video isn't reliably in it. /watch/[id] resolves
            // any real video directly regardless of what's in that list.
            <Link
              href={`/watch/${videoId}`}
              className="px-5 py-2.5 rounded-full bg-primary text-bg text-sm font-semibold"
            >
              Watch it now
            </Link>
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
        <h2 className="text-lg font-semibold">{processingHeadline}</h2>
        <p className="text-text-secondary text-sm max-w-sm">
          {fileName} finished uploading and is being prepared for playback. This usually takes a
          few minutes.
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
          doesn&apos;t look like a playable video, or uses a codec this browser can&apos;t
          decode locally to check it (common with RAW camera formats like BRAW/R3D, or ProRes
          outside Safari). Try a standard export — H.264 or HEVC in MP4/MOV — and uploading again.
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

  if (status === "reading") {
    return (
      <div className="flex flex-col items-center justify-center gap-4 h-[60vh] text-center px-6">
        <Loader2 size={32} className="animate-spin text-primary" />
        <p className="text-sm text-text-secondary">Checking aspect ratio…</p>
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
      <div className="grid gap-6 px-4 py-6 pb-28 sm:px-6 md:grid-cols-2 md:gap-8 max-w-5xl mx-auto">
        <header className="md:col-span-2 flex items-center gap-3 border-b border-border pb-5">
          <UploadCloud size={22} className="text-primary" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Publish a Frame</h1>
            <p className="mt-1 text-xs text-text-secondary">Preview your video, trim it, pick a cover, then add the details.</p>
          </div>
        </header>
        <div className="min-w-0 md:sticky md:top-6 md:self-start">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-widest text-text-secondary">Preview</h2>
          {appliedFix?.type === "rotate" && probe ? (
            <div className="relative w-40 h-64 mx-auto overflow-hidden rounded-2xl bg-card border border-border">
              <video
                ref={previewVideoRef}
                src={probe.url}
                controls
                muted
                className="absolute top-1/2 left-1/2 origin-center object-contain"
                style={{ width: 256, height: 160, transform: "translate(-50%, -50%) rotate(90deg)" }}
              />
            </div>
          ) : (
            <div
              ref={previewContainerRef}
              className="relative rounded-2xl overflow-hidden bg-card border border-border"
              style={{
                aspectRatio:
                  appliedFix?.type === "crop" && probe
                    ? probe.width / probe.height
                    : (check.aspect.minRatio + check.aspect.maxRatio) / 2,
              }}
            >
              {probe && (
                <video ref={previewVideoRef} src={probe.url} className="w-full h-full object-contain" controls muted />
              )}
              {textEnabled && text.trim() && (
                <div
                  onPointerDown={handleTextPointerDown}
                  onPointerMove={handleTextPointerMove}
                  onPointerUp={handleTextPointerUp}
                  className="absolute -translate-x-1/2 -translate-y-1/2 px-3 py-1.5 rounded-md bg-black/55 text-white font-extrabold text-center cursor-grab active:cursor-grabbing select-none touch-none"
                  style={{ left: `${textPos.xPct * 100}%`, top: `${textPos.yPct * 100}%`, fontSize: "clamp(11px, 3.4vw, 22px)" }}
                >
                  {text}
                </div>
              )}
            </div>
          )}

          {probe && (
            <VideoTrimmer
              durationSeconds={probe.duration}
              start={trimStart}
              end={trimEnd}
              onChange={(s, e) => {
                setTrimStart(s);
                setTrimEnd(Math.max(s + 0.01, e));
                setCoverTime((t) => clamp(t, s, Math.max(s + 0.01, e)));
              }}
              onScrub={(seconds) => {
                if (previewVideoRef.current) previewVideoRef.current.currentTime = seconds;
              }}
            />
          )}

          {/* Cover-frame capture reads the raw, un-rotated local <video> via
              canvas — for a video queued for server-side rotation, that
              capture would come out sideways (the rotation only happens
              during Stream processing), so this is skipped for that one
              case and Cloudflare's own auto-generated poster applies once
              ready instead, same graceful fallback as never capturing at
              all. */}
          {probe && appliedFix?.type !== "rotate" && (
            <CoverFramePicker
              key={coverResetKey}
              videoRef={previewVideoRef}
              trimStart={trimStart}
              trimEnd={trimEnd}
              time={coverTime}
              onTimeChange={setCoverTime}
              textEnabled={textEnabled}
              onTextEnabledChange={setTextEnabled}
              text={text}
              onTextChange={setText}
              textPos={textPos}
              onCapture={setCoverBlob}
            />
          )}

          {appliedFix && (
            <p className="text-xs text-primary mt-2">
              {appliedFix.type === "rotate"
                ? "This Frame will be rotated 90° during processing — its cover will be picked automatically."
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
            {probe && <span className="tabular-nums">{formatTimestamp(probe.duration)}</span>}
          </div>

        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            publish();
          }}
          className="flex min-w-0 flex-col gap-5 rounded-2xl border border-border bg-card/30 p-4 sm:p-5"
        >
          <h2 className="text-sm font-semibold">Frame details</h2>
          <div>
            <label htmlFor="frame-title" className="text-sm font-medium mb-1.5 block">Title</label>
            <input
              id="frame-title"
              required
              maxLength={120}
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              placeholder="Give your Frame a title"
              className="w-full bg-card border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary transition-colors"
            />
          </div>
          <div>
            <label htmlFor="frame-description" className="text-sm font-medium mb-1.5 block">Description <span className="text-text-secondary font-normal">(optional)</span></label>
            <textarea
              id="frame-description"
              rows={3}
              maxLength={2000}
              value={draftDescription}
              onChange={(e) => setDraftDescription(e.target.value)}
              placeholder="What are we watching?"
              className="w-full bg-card border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary transition-colors resize-none"
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">
              Content type <span className="text-primary">*</span>
            </label>
            <ContentTypeSelect value={contentTypeTagId} onChange={setContentTypeTagId} />
          </div>

          {/* One consolidated "Tags" dropdown holding every tag facet
              (Genre/Topic required, Mood/Location/Gear optional) — each
              still its own nested dropdown/collapsible inside it, rather
              than Genre/Topic/Mood/Location/Gear each being a separate
              top-level block down the page. forceOpen re-expands this the
              moment a submit attempt fails on a missing genre/topic, so
              nesting a required field in here never means it gets missed —
              see CollapsibleTagSection's own doc comment. */}
          <CollapsibleTagSection
            title="Tags"
            summary={
              genreTagIds.length === 0 || topicTagIds.length === 0
                ? "Genre & Topic required"
                : `${genreTagIds.length + topicTagIds.length + moodTagIds.length + (locationTagId ? 1 : 0) + gearTagIds.length} selected`
            }
            forceOpen={!!tagFormError}
          >
            <div className="flex flex-col gap-4">
              <TagDropdownMultiSelect
                label="Genre"
                categoryIds={["fiction_genre", "documentary_genre"]}
                max={3}
                value={genreTagIds}
                onChange={setGenreTagIds}
                required
              />
              <TagDropdownMultiSelect
                label="Topic"
                categoryIds={["sports", "lifestyle_subject", "music", "gaming", "technology_knowledge"]}
                max={5}
                value={topicTagIds}
                onChange={setTopicTagIds}
                required
              />
              <CollapsibleTagSection
                title="Mood"
                summary={moodTagIds.length > 0 ? `${moodTagIds.length} selected` : "Optional"}
              >
                <TagMultiSelect
                  label="Mood"
                  categoryIds={["mood_tone", "visual_style"]}
                  max={3}
                  value={moodTagIds}
                  onChange={setMoodTagIds}
                />
              </CollapsibleTagSection>

              <CollapsibleTagSection title="Location" summary={locationTagId ? "Set" : "Optional"}>
                <LocationPicker value={locationTagId} onChange={setLocationTagId} />
              </CollapsibleTagSection>

              {/* Gear — optional but encouraged per the spec; a creator can
                  always skip unknown gear. One picker per sub-facet, each
                  its own set of taxonomy categories, all collapsed behind
                  a single nested section so skipping gear entirely doesn't
                  mean scrolling past eight always-open typeaheads first. */}
              <CollapsibleTagSection
                title="Gear"
                summary={gearTagIds.length > 0 ? `${gearTagIds.length} selected` : "Optional"}
              >
                <div className="flex flex-col gap-4">
                  <GearPicker label="Camera" categoryIds={["camera_model"]} value={gearTagIds} onChange={setGearTagIds} />
                  <GearPicker
                    label="Lenses"
                    categoryIds={["lens_family", "lens_type", "lens_manufacturer"]}
                    value={gearTagIds}
                    onChange={setGearTagIds}
                  />
                  <GearPicker
                    label="Lighting"
                    categoryIds={["lighting_fixture", "lighting_manufacturer"]}
                    value={gearTagIds}
                    onChange={setGearTagIds}
                  />
                  <GearPicker
                    label="Audio"
                    categoryIds={["microphone_model", "audio_recorder", "wireless_audio_system"]}
                    value={gearTagIds}
                    onChange={setGearTagIds}
                  />
                  <GearPicker
                    label="Camera movement"
                    categoryIds={["camera_movement", "camera_support"]}
                    value={gearTagIds}
                    onChange={setGearTagIds}
                  />
                  <GearPicker
                    label="Format"
                    categoryIds={["recording_format", "film_gauge", "film_stock"]}
                    value={gearTagIds}
                    onChange={setGearTagIds}
                  />
                  <GearPicker
                    label="Post production"
                    categoryIds={["editing_software", "colour_software", "vfx_software", "audio_post_software"]}
                    value={gearTagIds}
                    onChange={setGearTagIds}
                  />
                  <GearPicker label="Craft" categoryIds={["craft"]} value={gearTagIds} onChange={setGearTagIds} />
                </div>
              </CollapsibleTagSection>
            </div>
          </CollapsibleTagSection>

          {tagFormError && <p className="text-xs text-red-400">{tagFormError}</p>}

          {probe && (
            <p className="text-xs text-text-secondary">
              {probe.duration <= SHORTS_MAX_DURATION_SECONDS
                ? "Feed: Shorts · 6:00 or less"
                : "Feed: Discover · longer than 6:00"}
            </p>
          )}

          {/* Only reachable once the probed duration actually clears the
              threshold — for anything shorter, LongForm literally isn't a
              selectable option, not just an unenforced client hint (the
              server independently re-derives "short" regardless either
              way). Same pill-toggle pattern as the Upload/Record source
              switch above, not a new UI pattern. */}
          {probe && probe.duration > SHORTS_MAX_DURATION_SECONDS && (
            <div>
              <label className="text-sm font-medium mb-1.5 block">Format</label>
              <div className="inline-flex items-center gap-1 p-1 rounded-full bg-card border border-border">
                <button
                  type="button"
                  onClick={() => setIsLongform(false)}
                  className={cn(
                    "px-4 py-1.5 rounded-full text-xs font-semibold transition-colors",
                    !isLongform ? "bg-primary text-bg" : "text-text-secondary hover:text-accent"
                  )}
                >
                  Standard
                </button>
                <button
                  type="button"
                  onClick={() => setIsLongform(true)}
                  className={cn(
                    "px-4 py-1.5 rounded-full text-xs font-semibold transition-colors",
                    isLongform ? "bg-primary text-bg" : "text-text-secondary hover:text-accent"
                  )}
                >
                  LongForm
                </button>
              </div>
            </div>
          )}

          {/* Post (free, always available) / Promote (creator pays to
              boost visibility — hidden for approved Business Channels,
              who Run as an Ad instead) / Monetise (long-form only, shown
              only past the same duration threshold LongForm uses, disabled
              unless the account is actually eligible — server re-verifies
              this regardless, same as every other client hint here). No
              payment processor exists yet: Promote is fully selectable and
              genuinely saved, it just can't be charged/activated until
              that ships — see the note below the pills. */}
          <div>
            <label className="text-sm font-medium mb-1.5 block">Publish as</label>
            <div className="inline-flex flex-wrap items-center gap-1 p-1 rounded-full bg-card border border-border">
              <button
                type="button"
                onClick={() => setPublishMode("post")}
                className={cn(
                  "px-4 py-1.5 rounded-full text-xs font-semibold transition-colors",
                  publishMode === "post" ? "bg-primary text-bg" : "text-text-secondary hover:text-accent"
                )}
              >
                Post
              </button>
              {!isApprovedBusiness && (
                <button
                  type="button"
                  onClick={() => setPublishMode("promote")}
                  className={cn(
                    "px-4 py-1.5 rounded-full text-xs font-semibold transition-colors",
                    publishMode === "promote"
                      ? "bg-primary text-bg"
                      : "text-text-secondary hover:text-accent"
                  )}
                >
                  Promote
                </button>
              )}
              {probe && probe.duration > SHORTS_MAX_DURATION_SECONDS && (
                <button
                  type="button"
                  onClick={() => monetizationEligible && setPublishMode("monetise")}
                  disabled={!monetizationEligible}
                  title={monetizationEligible ? undefined : "You're not eligible to monetise Frames yet"}
                  className={cn(
                    "px-4 py-1.5 rounded-full text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
                    publishMode === "monetise"
                      ? "bg-primary text-bg"
                      : "text-text-secondary hover:text-accent"
                  )}
                >
                  Monetise
                </button>
              )}
            </div>
            {publishMode === "promote" && (
              <p className="text-xs text-text-secondary mt-1.5">
                Saved — boosted visibility starts once payments launch.
              </p>
            )}
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
              {status === "minting" ? "Starting upload…" : "Publish to FRAMES"}
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      <p className="text-primary text-xs font-semibold tracking-wide uppercase mb-1.5">Creator Studio</p>
      <h1 className="text-2xl font-bold mb-1">Upload a new Frame</h1>
      <p className="text-text-secondary text-sm mb-6">
        Landscape only. FRAMES supports 16:9, 21:9 Cinema, and 16:10 — no exceptions, no black
        bars.
      </p>

      <div className="inline-flex items-center gap-1 p-1 rounded-full bg-card border border-border mb-6">
        <button
          type="button"
          onClick={() => setSource("file")}
          className={cn(
            "flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold transition-colors",
            source === "file" ? "bg-primary text-bg" : "text-text-secondary hover:text-accent"
          )}
        >
          <UploadCloud size={13} />
          Upload
        </button>
        <button
          type="button"
          onClick={() => setSource("camera")}
          className={cn(
            "flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold transition-colors",
            source === "camera" ? "bg-primary text-bg" : "text-text-secondary hover:text-accent"
          )}
        >
          <Video size={13} />
          Record
        </button>
      </div>

      {source === "camera" ? (
        <CameraCapture onCapture={analyzeFile} onClose={() => setSource("file")} />
      ) : (
        <div
          role="button"
          tabIndex={0}
          aria-label="Choose a Frame file to upload"
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

          <UploadCloud size={32} className="text-text-secondary" />
          <p className="text-sm font-medium">Drag & drop your Frame, or click to browse</p>
          <p className="text-xs text-text-secondary">
            MP4, MOV, MKV, WebM, and most camera formats · up to 4K · 60fps
          </p>
        </div>
      )}
    </div>
  );
}
