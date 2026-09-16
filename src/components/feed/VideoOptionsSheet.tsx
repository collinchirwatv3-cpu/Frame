"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { SHEET_SPRING } from "@/lib/motion";
import { Check, EyeOff, Flag, Pencil, Trash2, Users } from "lucide-react";
import { useEscapeToClose } from "@/lib/use-escape-to-close";
import { useCurrentUserStore } from "@/store/current-user-store";
import { EditFrameSheet } from "./EditFrameSheet";
import { DeleteFrameDialog } from "./DeleteFrameDialog";
import type { Video } from "@/lib/types";

export function VideoOptionsSheet({
  video,
  open,
  onClose,
}: {
  video: Video;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const ownProfileId = useCurrentUserStore((s) => s.profile?.id);
  const isOwner = !!ownProfileId && ownProfileId === video.creator.id;

  useEscapeToClose(open, onClose);

  // Edit/Delete render outside the AnimatePresence below on purpose: that
  // one keys off the `open` prop this component receives from its parent,
  // but these two need to keep their own state alive (and their own sheets
  // visible) after their onClick tells the parent to close this sheet via
  // onClose() — see the buttons below.

  function handleWatchTogether() {
    const roomId = crypto.randomUUID();
    router.push(`/watch-together/${roomId}?v=${video.id}`);
  }

  function closeSoon() {
    window.setTimeout(() => {
      onClose();
      setFeedback(null);
    }, 900);
  }

  function handleNotInterested() {
    setFeedback("You'll see fewer Frames like this");
    closeSoon();
  }

  async function handleReport() {
    setReporting(true);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: video.id }),
      });
      if (res.status === 401) {
        window.location.assign("/login");
        return;
      }
      if (!res.ok) throw new Error();
      setFeedback("Reported — thanks for helping keep FRAMES safe");
    } catch {
      setFeedback("Couldn't submit your report — try again");
    } finally {
      setReporting(false);
      closeSoon();
    }
  }

  return (
    <>
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
              aria-label="Frame options"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={SHEET_SPRING}
              className="fixed inset-x-0 bottom-0 z-[61] flex flex-col bg-card border-t border-border rounded-t-2xl md:max-w-xs md:left-auto md:right-6 md:bottom-6 md:rounded-2xl md:border"
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
            >
              {feedback ? (
                <div className="flex items-center gap-2 px-5 py-6 justify-center text-sm font-medium">
                  <Check size={16} className="text-primary" />
                  {feedback}
                </div>
              ) : (
                <div className="flex flex-col py-2">
                  {isOwner && (
                    <>
                      <button
                        onClick={() => {
                          onClose();
                          setEditOpen(true);
                        }}
                        className="flex items-center gap-3 px-5 py-3.5 text-sm font-medium hover:bg-bg transition-colors text-left"
                      >
                        <Pencil size={18} className="text-text-secondary" />
                        Edit Frame
                      </button>
                      <button
                        onClick={() => {
                          onClose();
                          setDeleteOpen(true);
                        }}
                        className="flex items-center gap-3 px-5 py-3.5 text-sm font-medium hover:bg-bg transition-colors text-left text-primary"
                      >
                        <Trash2 size={18} />
                        Delete Frame
                      </button>
                      <div className="h-px bg-border my-1 mx-5" />
                    </>
                  )}
                  <button
                    onClick={handleWatchTogether}
                    className="flex items-center gap-3 px-5 py-3.5 text-sm font-medium hover:bg-bg transition-colors text-left"
                  >
                    <Users size={18} className="text-text-secondary" />
                    Watch together
                  </button>
                  <button
                    onClick={handleNotInterested}
                    className="flex items-center gap-3 px-5 py-3.5 text-sm font-medium hover:bg-bg transition-colors text-left"
                  >
                    <EyeOff size={18} className="text-text-secondary" />
                    Not interested
                  </button>
                  <button
                    onClick={handleReport}
                    disabled={reporting}
                    className="flex items-center gap-3 px-5 py-3.5 text-sm font-medium hover:bg-bg transition-colors text-left text-primary disabled:opacity-50"
                  >
                    <Flag size={18} />
                    Report Frame
                  </button>
                  <div className="h-px bg-border my-1 mx-5" />
                  <button
                    onClick={onClose}
                    className="px-5 py-3.5 text-sm font-medium text-text-secondary hover:bg-bg transition-colors text-left"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {isOwner && (
        <>
          <EditFrameSheet video={video} open={editOpen} onClose={() => setEditOpen(false)} />
          <DeleteFrameDialog video={video} open={deleteOpen} onClose={() => setDeleteOpen(false)} />
        </>
      )}
    </>
  );
}
