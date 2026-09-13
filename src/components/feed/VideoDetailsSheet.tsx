"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Aperture, Clapperboard, Film, MapPin, Play, Scissors, Tag, X } from "lucide-react";
import { SHEET_SPRING } from "@/lib/motion";
import { useEscapeToClose } from "@/lib/use-escape-to-close";
import { formatTimestamp } from "@/lib/utils";
import { useClipsStore } from "@/store/clips-store";
import type { Video } from "@/lib/types";

function Row({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-8 h-8 rounded-full bg-bg flex items-center justify-center shrink-0 mt-0.5">
        <Icon size={14} className="text-primary" />
      </span>
      <div>
        <p className="text-[11px] text-text-secondary">{label}</p>
        <p className="text-sm">{value}</p>
      </div>
    </div>
  );
}

export function VideoDetailsSheet({
  video,
  open,
  onClose,
  onPlayClip,
}: {
  video: Video;
  open: boolean;
  onClose: () => void;
  /** Plays a Community Clip inline on the same player — bounded playback
   * of the same asset, not a new route/video. */
  onPlayClip: (startSeconds: number, endSeconds: number) => void;
}) {
  const d = video.details;
  const fetchClips = useClipsStore((s) => s.fetchClips);
  const clips = useClipsStore((s) => s.byVideoId[video.id] ?? []);

  useEscapeToClose(open, onClose);

  useEffect(() => {
    if (open) fetchClips(video.id);
  }, [open, video.id, fetchClips]);

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
            aria-label={`${video.title} details`}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={SHEET_SPRING}
            className="fixed inset-x-0 bottom-0 z-[61] max-h-[80vh] overflow-y-auto flex flex-col bg-card border-t border-border rounded-t-2xl md:max-w-md md:left-auto md:right-6 md:bottom-6 md:rounded-2xl md:border"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.25rem)" }}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="text-sm font-semibold truncate pr-4">{video.title}</h2>
              <button
                onClick={onClose}
                aria-label="Close"
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-bg transition-colors shrink-0"
              >
                <X size={16} />
              </button>
            </div>

            <div className="px-5 py-4 flex flex-col gap-4">
              <p className="text-sm text-accent/90">{video.description}</p>

              {!d && (
                <p className="text-xs text-text-secondary">
                  The creator hasn&apos;t shared shooting details for this one.
                </p>
              )}

              {d && (
                <div className="flex flex-col gap-3.5 pt-1">
                  {(d.camera || d.lens) && (
                    <Row
                      icon={Aperture}
                      label="Camera"
                      value={[d.camera, d.lens].filter(Boolean).join(" · ")}
                    />
                  )}
                  {(d.fps || d.codec) && (
                    <Row
                      icon={Film}
                      label="Format"
                      value={[d.fps ? `${d.fps}fps` : null, d.codec].filter(Boolean).join(" · ")}
                    />
                  )}
                  {d.location && <Row icon={MapPin} label="Location" value={d.location} />}
                  {d.equipment && d.equipment.length > 0 && (
                    <Row icon={Clapperboard} label="Equipment" value={d.equipment.join(", ")} />
                  )}
                  {d.tags && d.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {d.tags.map((tag) => (
                        <span
                          key={tag}
                          className="flex items-center gap-1 text-[11px] text-text-secondary bg-bg px-2 py-1 rounded-full"
                        >
                          <Tag size={10} />
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  {d.creatorNotes && (
                    <div className="pt-2 border-t border-border">
                      <p className="text-[11px] text-text-secondary mb-1">Creator&apos;s notes</p>
                      <p className="text-sm text-accent/90">{d.creatorNotes}</p>
                    </div>
                  )}
                  {d.behindTheScenes && (
                    <div>
                      <p className="text-[11px] text-text-secondary mb-1">Behind the scenes</p>
                      <p className="text-sm text-accent/90">{d.behindTheScenes}</p>
                    </div>
                  )}
                </div>
              )}

              {clips.length > 0 && (
                <div className="pt-3 border-t border-border flex flex-col gap-1">
                  <p className="text-[11px] text-text-secondary mb-1 flex items-center gap-1">
                    <Scissors size={11} />
                    Community Clips
                  </p>
                  {clips.map((clip) => (
                    <button
                      key={clip.id}
                      onClick={() => onPlayClip(clip.startSeconds, clip.endSeconds)}
                      className="flex items-center gap-2 py-2 rounded-lg hover:bg-bg transition-colors text-left"
                    >
                      <span className="w-7 h-7 rounded-full bg-bg flex items-center justify-center shrink-0">
                        <Play size={11} className="text-primary" />
                      </span>
                      <span className="text-sm truncate">
                        Clip · {clip.creatorDisplayName} · {formatTimestamp(clip.startSeconds)}–
                        {formatTimestamp(clip.endSeconds)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
