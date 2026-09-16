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
import { cn } from "@/lib/utils";
import { checkUpload, qualityLabel, type UploadCheck } from "@/lib/video-validation";
import { deriveTitleFromFilename } from "@/lib/upload";
import { LONGFORM_MIN_DURATION_SECONDS } from "@/lib/validation/upload";
import { useUploadDraftStore } from "@/store/upload-draft-store";
import { useCurrentUserStore } from "@/store/current-user-store";
import { createClient } from "@/lib/supabase/client";
import { UploadRejection } from "./UploadRejection";
import { CameraCapture } from "./CameraCapture";
import { ThumbnailPicker } from "./ThumbnailPicker";
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
  | "thumbnail"
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
  const [isApprovedBusiness, setIsApprovedBusiness] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
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
    setPosterUrl(null);
    setErrorMessage("");
    setIsLongform(false);
    setPublishMode("post");
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
        .select("processing_status, poster_url")
        .eq("id", id)
        .single();

      if (error) return; // transient — try again on the next tick

      if (data.processing_status === "ready") {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        setPosterUrl(data.poster_url);
        setStatus("thumbnail");
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
          // when the LongForm toggle is shown (>= 3 minutes).
          contentType: isLongform ? "longform" : "film",
          publishMode,
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

  if (status === "thumbnail" && videoId && posterUrl) {
    const finish = () => {
      clearDraft();
      setStatus("published");
    };
    return (
      <ThumbnailPicker
        videoId={videoId}
        durationSeconds={probe?.duration ?? 0}
        posterUrl={posterUrl}
        onDone={(newPosterUrl) => {
          setPosterUrl(newPosterUrl);
          finish();
        }}
        onSkip={finish}
      />
    );
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
                ? "This Frame will be rotated 90° during processing."
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
              placeholder="Give your Frame a title"
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
            <label className="text-sm font-medium mb-1.5 block">
              Content type <span className="text-primary">*</span>
            </label>
            <ContentTypeSelect value={contentTypeTagId} onChange={setContentTypeTagId} />
          </div>

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
              always skip unknown gear. One picker per sub-facet, each its
              own set of taxonomy categories, all collapsed behind a single
              section so skipping gear entirely doesn't mean scrolling past
              eight always-open typeaheads first. */}
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

          {tagFormError && <p className="text-xs text-red-400">{tagFormError}</p>}

          {/* Only reachable once the probed duration actually clears the
              threshold — for anything shorter, LongForm literally isn't a
              selectable option, not just an unenforced client hint (the
              server independently re-derives "short" regardless either
              way). Same pill-toggle pattern as the Upload/Record source
              switch above, not a new UI pattern. */}
          {probe && probe.duration >= LONGFORM_MIN_DURATION_SECONDS && (
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
              {probe && probe.duration >= LONGFORM_MIN_DURATION_SECONDS && (
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
