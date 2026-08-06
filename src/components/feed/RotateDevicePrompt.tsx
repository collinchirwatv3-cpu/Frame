"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { RotateCw } from "lucide-react";
import { DURATION } from "@/lib/motion";
import { useIsPortraitMobile } from "@/lib/use-portrait-mobile";

/** Can't force rotation — iOS Safari doesn't reliably support the Screen
 * Orientation lock API — so this is persuasion, not enforcement. Dismissing
 * it only holds for the current mount (i.e. this feed session); rotating
 * away and back to portrait later shows it again, since that's a fresh
 * decision each time rather than nagging. */
export function RotateDevicePrompt() {
  const shouldRotate = useIsPortraitMobile();
  const [dismissed, setDismissed] = useState(false);

  const visible = shouldRotate && !dismissed;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: DURATION.base }}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-bg/95 backdrop-blur-sm px-8 text-center md:hidden"
        >
          <motion.span
            animate={{ rotate: [0, -90, -90, 0] }}
            transition={{ duration: 2.2, repeat: Infinity, repeatDelay: 1, ease: "easeInOut" }}
            className="w-14 h-14 rounded-2xl border-2 border-accent flex items-center justify-center"
          >
            <RotateCw size={24} />
          </motion.span>
          <p className="text-sm font-medium">Turn your phone sideways</p>
          <p className="text-xs text-text-secondary max-w-[240px]">
            FRAMES is built for landscape. Rotate for the FULL CINEMATIC view.
          </p>
          <button
            onClick={() => setDismissed(true)}
            className="mt-2 text-xs text-text-secondary underline underline-offset-2"
          >
            Not now
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
