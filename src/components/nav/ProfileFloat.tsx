"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { CHROME_FADE_TRANSITION } from "@/lib/motion";
import { usePlayerStore } from "@/store/player-store";
import { ProfileAvatarLink } from "./ProfileAvatarLink";

/**
 * Fixed floating version of ProfileAvatarLink — for pages with video chrome
 * (VideoCard's own search/mute/Director-Mode cluster in that same top-right
 * corner) where a plain inline header doesn't exist to put it in. Positioned
 * a row below that cluster rather than squeezed into it, so it doesn't need
 * hand-tuned horizontal offsets against several independently-positioned
 * buttons. Fades with Director Mode same as the rest of the feed chrome.
 *
 * Home renders ProfileAvatarLink directly instead, inline in its own header
 * next to the FRAMES logo — Home has no video chrome to float over, so a
 * normal in-flow element aligned with the logo reads better than a
 * separately-floating one. This component is for /watch/[id] only now.
 */
export function ProfileFloat() {
  const directorMode = usePlayerStore((s) => s.directorMode);

  return (
    <motion.div
      animate={{ opacity: directorMode ? 0 : 1 }}
      transition={CHROME_FADE_TRANSITION}
      className={cn("fixed top-16 right-4 md:top-20 md:right-6 z-30", directorMode && "pointer-events-none")}
    >
      <ProfileAvatarLink />
    </motion.div>
  );
}
