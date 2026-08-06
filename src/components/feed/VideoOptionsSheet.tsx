"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, EyeOff, Flag } from "lucide-react";
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
  const [feedback, setFeedback] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);

  function closeSoon() {
    window.setTimeout(() => {
      onClose();
      setFeedback(null);
    }, 900);
  }

  function handleNotInterested() {
    setFeedback("You'll see fewer videos like this");
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
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
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
                  Report video
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
  );
}
