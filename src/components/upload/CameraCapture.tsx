"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Camera,
  CameraOff,
  Check,
  Circle,
  RotateCw,
  Smartphone,
  Square,
  SwitchCamera,
  X,
} from "lucide-react";

type Phase = "unsupported" | "requesting" | "denied" | "live" | "recording" | "reviewing";
type FacingMode = "environment" | "user";

// Safari only started shipping MediaRecorder support for mp4 recently and
// still prefers it; every other real target supports vp9/vp8 webm. First
// supported wins — no fallback needed beyond the browser's own default.
function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "video/mp4;codecs=h264,aac",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * In-app camera recording, feeding straight into UploadDropzone's existing
 * pipeline via onCapture(file) — the same checkUpload/rotate-fix/publish
 * flow a picked file already goes through, so a recording that somehow
 * comes out portrait still gets the normal recovery UX, not a dead end.
 *
 * Landscape is hard-gated here rather than corrected after the fact:
 * getUserMedia's orientation behavior is notoriously inconsistent across
 * mobile browsers, so the reliable move is asking the creator to physically
 * rotate the device and blocking Record until `matchMedia` confirms it —
 * consistent with "FRAME is landscape only, no exceptions" elsewhere in the
 * upload flow.
 */
export function CameraCapture({
  onCapture,
  onClose,
}: {
  onCapture: (file: File) => void;
  onClose: () => void;
}) {
  const isSupported =
    typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
  const [phase, setPhase] = useState<Phase>(isSupported ? "requesting" : "unsupported");
  const [facingMode, setFacingMode] = useState<FacingMode>("environment");
  const [isLandscape, setIsLandscape] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [reviewUrl, setReviewUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reviewBlobRef = useRef<Blob | null>(null);

  // Not async/await — a plain .then()/.catch() chain so the setState calls
  // that report the outcome are provably inside a later callback, not the
  // synchronous portion of the function the mount effect below calls
  // directly (matches the pattern AuthListener.tsx uses for the same
  // "kick off async work from an effect" shape).
  function startStream(mode: FacingMode) {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: mode, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: true,
      })
      .then((stream) => {
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setPhase("live");
      })
      .catch((err) => {
        setErrorMessage(err instanceof Error ? err.message : "Camera access was denied.");
        setPhase("denied");
      });
  }

  useEffect(() => {
    if (!isSupported) return;
    startStream(facingMode);
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const query = window.matchMedia("(orientation: landscape)");
    const update = () => setIsLandscape(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  function flipCamera() {
    const next = facingMode === "environment" ? "user" : "environment";
    setFacingMode(next);
    setPhase("requesting");
    startStream(next);
  }

  function startRecording() {
    if (!streamRef.current) return;
    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(streamRef.current, mimeType ? { mimeType } : undefined);
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType || "video/webm" });
      reviewBlobRef.current = blob;
      setReviewUrl(URL.createObjectURL(blob));
      setPhase("reviewing");
    };
    recorderRef.current = recorder;
    recorder.start();
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    setPhase("recording");
  }

  function stopRecording() {
    recorderRef.current?.stop();
    if (timerRef.current) clearInterval(timerRef.current);
  }

  function retake() {
    if (reviewUrl) URL.revokeObjectURL(reviewUrl);
    setReviewUrl(null);
    reviewBlobRef.current = null;
    setPhase("live");
  }

  function useRecording() {
    if (!reviewBlobRef.current) return;
    const ext = reviewBlobRef.current.type.includes("mp4") ? "mp4" : "webm";
    const file = new File([reviewBlobRef.current], `frame-recording-${Date.now()}.${ext}`, {
      type: reviewBlobRef.current.type || "video/webm",
    });
    streamRef.current?.getTracks().forEach((t) => t.stop());
    onCapture(file);
  }

  if (phase === "unsupported") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 text-center h-[60vh] px-6">
        <AlertCircle size={40} className="text-primary" />
        <h2 className="text-lg font-semibold">Recording isn&apos;t supported here</h2>
        <p className="text-sm text-text-secondary max-w-sm">
          This browser can&apos;t access the camera directly. Upload a video file instead.
        </p>
        <button
          onClick={onClose}
          className="mt-2 px-5 py-2.5 rounded-full border border-border text-sm font-medium hover:bg-card transition-colors"
        >
          Back to upload
        </button>
      </div>
    );
  }

  if (phase === "denied") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 text-center h-[60vh] px-6">
        <CameraOff size={40} className="text-primary" />
        <h2 className="text-lg font-semibold">Camera access needed</h2>
        <p className="text-sm text-text-secondary max-w-sm">
          {errorMessage || "Allow camera access in your browser to record directly in FRAME."}
        </p>
        <button
          onClick={onClose}
          className="mt-2 px-5 py-2.5 rounded-full border border-border text-sm font-medium hover:bg-card transition-colors"
        >
          Back to upload
        </button>
      </div>
    );
  }

  if (phase === "reviewing" && reviewUrl) {
    return (
      <div className="flex flex-col items-center gap-4">
        <video
          src={reviewUrl}
          controls
          autoPlay
          muted
          className="w-full rounded-2xl bg-card border border-border aspect-video object-contain"
        />
        <div className="flex gap-3 w-full">
          <button
            onClick={retake}
            className="flex-1 py-2.5 rounded-full border border-border text-sm font-medium hover:bg-card transition-colors"
          >
            Retake
          </button>
          <button
            onClick={useRecording}
            className="flex-1 py-2.5 rounded-full bg-primary text-bg text-sm font-semibold flex items-center justify-center gap-2"
          >
            <Check size={16} />
            Use this take
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="relative rounded-2xl overflow-hidden bg-black aspect-video">
        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />

        {phase === "requesting" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Camera size={28} className="text-text-secondary animate-pulse" />
          </div>
        )}

        {!isLandscape && phase !== "requesting" && (
          <div className="absolute inset-0 bg-bg/90 backdrop-blur-sm flex flex-col items-center justify-center gap-3 text-center px-6">
            <div className="relative">
              <Smartphone size={30} className="text-text-secondary" />
              <RotateCw size={16} className="absolute -top-1.5 -right-1.5 text-primary" />
            </div>
            <p className="text-sm font-medium">Rotate your device to landscape</p>
            <p className="text-xs text-text-secondary max-w-[220px]">
              FRAME is landscape only — turn your phone sideways to start recording.
            </p>
          </div>
        )}

        {phase === "recording" && (
          <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-bg/70 backdrop-blur-md rounded-full px-3 py-1.5 text-xs font-semibold text-primary">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            {formatElapsed(elapsed)}
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-6 mt-6">
        <button
          onClick={onClose}
          aria-label="Cancel"
          className="w-11 h-11 rounded-full border border-border flex items-center justify-center hover:bg-card transition-colors"
        >
          <X size={18} />
        </button>

        {phase === "recording" ? (
          <button
            onClick={stopRecording}
            aria-label="Stop recording"
            className="w-16 h-16 rounded-full border-4 border-primary flex items-center justify-center"
          >
            <Square size={22} className="text-primary fill-primary" />
          </button>
        ) : (
          <button
            onClick={startRecording}
            disabled={!isLandscape || phase !== "live"}
            aria-label="Start recording"
            className="w-16 h-16 rounded-full border-4 border-primary flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Circle size={30} className="text-primary fill-primary" />
          </button>
        )}

        <button
          onClick={flipCamera}
          disabled={phase !== "live"}
          aria-label="Switch camera"
          className="w-11 h-11 rounded-full border border-border flex items-center justify-center hover:bg-card transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <SwitchCamera size={18} />
        </button>
      </div>
    </div>
  );
}
