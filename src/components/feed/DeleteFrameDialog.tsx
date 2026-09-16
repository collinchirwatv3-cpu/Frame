"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useEscapeToClose } from "@/lib/use-escape-to-close";
import type { Video } from "@/lib/types";

/** Same confirm-dialog skeleton as DeleteAccountDialog, without the typed
 * confirmation phrase — deleting one video is a real, permanent action but
 * a much smaller blast radius than deleting the whole account, so a plain
 * Cancel/Delete pair is proportionate friction rather than under- or
 * over-doing it. */
export function DeleteFrameDialog({ video, open, onClose }: { video: Video; open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  function handleClose() {
    if (deleting) return;
    setError("");
    onClose();
  }

  useEscapeToClose(open, handleClose);

  async function handleDelete() {
    setDeleting(true);
    setError("");
    try {
      const res = await fetch(`/api/videos/${video.id}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof body.error === "string" ? body.error : "Could not delete that Frame.");
      }
      // The video is gone — nothing in the current view still references
      // valid data, so leave it for the profile grid (fetched fresh) rather
      // than trying to patch every possible feed/store this card could be
      // rendered from.
      router.push("/profile");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setDeleting(false);
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
            aria-label="Delete this Frame"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            className="fixed inset-x-0 bottom-0 z-[61] flex flex-col bg-card border-t border-border rounded-t-2xl md:max-w-sm md:left-auto md:right-6 md:bottom-6 md:rounded-2xl md:border"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.5rem)" }}
          >
            <div className="flex flex-col items-center text-center gap-2 px-6 pt-6 pb-2">
              <span className="w-11 h-11 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                <AlertTriangle size={20} />
              </span>
              <h2 className="text-base font-semibold">Delete this Frame?</h2>
              <p className="text-sm text-text-secondary">
                &quot;{video.title}&quot; and everything on it — likes, comments, saves, clips —
                will be permanently removed. This can&apos;t be undone.
              </p>
              {error && (
                <p role="alert" className="text-xs text-primary">
                  {error}
                </p>
              )}
            </div>

            <div className="flex gap-3 px-6 pt-5">
              <button
                type="button"
                onClick={handleClose}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-full border border-border text-sm font-medium hover:bg-bg transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-full bg-primary text-bg text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40"
              >
                {deleting && <Loader2 size={16} className="animate-spin" />}
                {deleting ? "Deleting…" : "Delete Frame"}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
