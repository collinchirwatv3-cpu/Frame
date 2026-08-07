"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { navItems } from "./nav-items";
import { CHROME_FADE_TRANSITION } from "@/lib/motion";
import { CHROME_GLASS_CLASS, CHROME_TAP_SCALE } from "@/lib/chrome";
import { usePlayerStore } from "@/store/player-store";
import { useIsLandscapeMobile } from "@/lib/use-landscape-mobile";

// BottomNav rotated 90° for a phone turned sideways: the horizontal row of
// four icons along the bottom in portrait becomes a vertical column along
// the left edge in landscape (same side as SideRail's own left-edge desktop
// nav, for consistency between the two), vertically centered rather than
// stretched top-to-bottom. Individual floating circular buttons (matching
// SearchButton/ActionRail's own per-button styling) rather than one large
// backdrop-blurred panel behind them — an earlier full-height bar-with-
// background version read as too heavy for a screen already short on
// vertical room. Gated on useIsLandscapeMobile() (a real device-shape
// check, orientation + short height) rather than a `landscape:max-md:`
// width breakpoint — plenty of phones exceed md's 768px once rotated to
// landscape, which was leaking SideRail's full 240px desktop treatment
// onto phones instead of this compact rail. SideRail ducks out under the
// same check, so the two never double up.
export function LandscapeSideRail() {
  const pathname = usePathname();
  const directorMode = usePlayerStore((s) => s.directorMode);
  const isLandscapeMobile = useIsLandscapeMobile();

  if (!isLandscapeMobile) return null;

  return (
    <motion.nav
      animate={{ opacity: directorMode ? 0 : 1 }}
      transition={CHROME_FADE_TRANSITION}
      aria-label="Primary"
      className={cn(
        "fixed left-4 top-1/2 -translate-y-1/2 z-40 flex flex-col items-center gap-3",
        directorMode && "pointer-events-none"
      )}
      style={{ marginLeft: "env(safe-area-inset-left)" }}
    >
      {navItems.map(({ href, label, icon: Icon }) => {
        const active = pathname.startsWith(href);

        return (
          <Link key={href} href={href} aria-label={label}>
            <motion.span
              whileTap={{ scale: CHROME_TAP_SCALE }}
              className={cn(CHROME_GLASS_CLASS, "flex items-center justify-center w-9 h-9")}
            >
              <Icon
                size={17}
                strokeWidth={active ? 2.5 : 1.75}
                className={cn("transition-colors", active ? "text-accent" : "text-text-secondary")}
              />
            </motion.span>
          </Link>
        );
      })}
    </motion.nav>
  );
}
