"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { UserCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { CHROME_FADE_TRANSITION } from "@/lib/motion";
import { Avatar } from "@/components/ui/Avatar";
import { usePlayerStore } from "@/store/player-store";
import { useCurrentUserStore } from "@/store/current-user-store";

/**
 * Was anchored at the bottom of SideRail (desktop-only, scrolled with it,
 * out of view on mobile entirely). Now a single fixed floating button, top
 * right, on every page — the one standing way back to your own profile.
 *
 * Positioned a row below the search/mute/Director-Mode cluster some pages
 * float in that same top-right corner (VideoCard, ShortsFeed, Upload,
 * Collections) rather than squeezed into the same row — avoids having to
 * hand-tune horizontal offsets against several independently-positioned
 * buttons; a small vertical gap is safe everywhere without touching them.
 * Fades with Director Mode same as the rest of the feed chrome, so it
 * doesn't linger over the chrome-free cinematic view.
 *
 * Rendered from (app)/layout.tsx (covers every app-shell page) and
 * directly on /watch/[id] (the one standalone, chrome-free route that
 * still needs it — share/deep-link video pages).
 */
export function ProfileFloat() {
  const directorMode = usePlayerStore((s) => s.directorMode);
  const profile = useCurrentUserStore((s) => s.profile);

  return (
    <motion.div
      animate={{ opacity: directorMode ? 0 : 1 }}
      transition={CHROME_FADE_TRANSITION}
      className={cn(
        "fixed top-16 right-4 md:top-20 md:right-6 z-30",
        directorMode && "pointer-events-none"
      )}
    >
      <Link
        href={profile ? "/profile" : "/login"}
        aria-label={profile ? "Your profile" : "Log in"}
        className="flex items-center justify-center w-9 h-9 rounded-full bg-card/70 backdrop-blur-md overflow-hidden ring-2 ring-bg/70"
      >
        {profile ? (
          <Avatar src={profile.avatarUrl} alt={profile.displayName} size={36} className="w-full h-full" />
        ) : (
          <UserCircle2 size={20} />
        )}
      </Link>
    </motion.div>
  );
}
