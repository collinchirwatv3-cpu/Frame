"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { navItems } from "./nav-items";
import { CHROME_FADE_TRANSITION } from "@/lib/motion";
import { usePlayerStore } from "@/store/player-store";

// BottomNav rotated to the right edge for a phone turned sideways — a
// full-width bottom bar would eat into the 16:9 video itself in landscape,
// same reason YouTube/TikTok move to a slim side rail rather than keeping
// the tab bar pinned to the (now much shorter) bottom edge. Orientation-
// driven (`landscape:`), not width-driven like SideRail's `md:` — a phone
// rotated sideways can be wider or narrower than the md breakpoint
// depending on the device, but it's always `orientation: landscape`.
// Scoped to `max-md` so it never doubles up with the real desktop SideRail,
// which is already visible any time the viewport is landscape-shaped.
export function LandscapeSideRail() {
  const pathname = usePathname();
  const directorMode = usePlayerStore((s) => s.directorMode);

  return (
    <motion.nav
      animate={{ opacity: directorMode ? 0 : 1 }}
      transition={CHROME_FADE_TRANSITION}
      className={cn(
        // top-28 keeps clear of the fixed top-right SearchButton (top-4,
        // ~52px tall) and ProfileFloat (top-16, ~104px tall) that several
        // pages stack in that same corner — this rail is the first thing
        // to also claim the full right edge, so it has to duck under them
        // rather than the reverse.
        "hidden landscape:max-md:flex fixed right-0 top-28 bottom-0 z-40 flex-col items-center justify-center gap-3 border-l border-border bg-bg/80 backdrop-blur-xl px-2",
        directorMode && "pointer-events-none"
      )}
      style={{ paddingRight: "env(safe-area-inset-right)" }}
    >
      {navItems.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        const isUpload = href === "/upload";

        return (
          <Link key={href} href={href} aria-label={label} className="flex items-center justify-center p-2">
            {isUpload ? (
              <motion.span
                whileTap={{ scale: 0.88 }}
                className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary text-bg"
              >
                <Icon size={18} strokeWidth={2.5} />
              </motion.span>
            ) : (
              <motion.span whileTap={{ scale: 0.85 }}>
                <Icon
                  size={22}
                  strokeWidth={active ? 2.5 : 1.75}
                  className={cn("transition-colors", active ? "text-accent" : "text-text-secondary")}
                />
              </motion.span>
            )}
          </Link>
        );
      })}
    </motion.nav>
  );
}
