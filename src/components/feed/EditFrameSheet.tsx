"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Pencil, X } from "lucide-react";
import { SHEET_SPRING } from "@/lib/motion";
import { useEscapeToClose } from "@/lib/use-escape-to-close";
import type { Video } from "@/lib/types";

const TITLE_MAX = 120;
const DESCRIPTION_MAX = 2000;

/** Same sheet skeleton as ClipCreateSheet/CommentDrawer/VideoOptionsSheet
 * (backdrop + SHEET_SPRING slide-up + useEscapeToClose + {video, open,
 * onClose}). Only title/description are editable — see
 * 20260919100000_video_self_edit.sql for why tags aren't part of this. */
export function EditFrameSheet({
  video,
  open,
  onClose,
  onSaved,
}: {
  video: Video;
  open: boolean;
  onClose: () => void;
  onSaved?: (update: { title: string; description: string }) => void;
}) {
  const [title, setTitle] = useState(video.title);
  const [description, setDescription] = useState(video.description);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEscapeToClose(open, onClose);

  function handleClose() {
    if (saving) return;
    onClose();
  }

  async function handleSave() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Title is required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/videos/${video.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmedTitle, description: description.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof body.error === "string" ? body.error : "Couldn't save those changes.");
      }
      onSaved?.({ title: body.title, description: body.description });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save those changes. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-bg/70 backdrop-blur-sm z-[60]"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Edit Frame"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={SHEET_SPRING}
            className="fixed inset-x-0 bottom-0 z-[61] flex flex-col bg-card border-t border-border rounded-t-2xl md:max-w-md md:left-auto md:right-6 md:bottom-6 md:rounded-2xl md:border"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.25rem)" }}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="text-sm font-semibold flex items-center gap-1.5">
                <Pencil size={15} className="text-primary" />
                Edit Frame
              </h2>
              <button
                onClick={handleClose}
                aria-label="Close"
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-bg transition-colors shrink-0"
              >
                <X size={16} />
              </button>
            </div>

            <div className="px-5 py-4 flex flex-col gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-text-secondary flex items-center justify-between">
                  <span>Title</span>
                  <span>
                    {title.length}/{TITLE_MAX}
                  </span>
                </span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value.slice(0, TITLE_MAX))}
                  disabled={saving}
                  className="bg-bg border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary transition-colors disabled:opacity-50"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-text-secondary flex items-center justify-between">
                  <span>Description</span>
                  <span>
                    {description.length}/{DESCRIPTION_MAX}
                  </span>
                </span>
                <textarea
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value.slice(0, DESCRIPTION_MAX))}
                  disabled={saving}
                  className="bg-bg border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary transition-colors resize-none disabled:opacity-50"
                />
              </label>

              {error && (
                <p role="alert" className="text-xs text-primary">
                  {error}
                </p>
              )}

              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full py-2.5 rounded-full bg-primary text-bg text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40"
              >
                {saving && <Loader2 size={16} className="animate-spin" />}
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
