"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { navItems } from "./nav-items";
import { CHROME_FADE_TRANSITION } from "@/lib/motion";
import { CHROME_GLASS_CLASS, CHROME_TAP_SCALE } from "@/lib/chrome";
import { usePlayerStore } from "@/store/player-store";

// BottomNav rotated 90° for a phone turned sideways: the horizontal row of
// four icons along the bottom in portrait becomes a vertical column along
// the right edge in landscape, vertically centered rather than stretched
// top-to-bottom. Individual floating circular buttons (matching
// SearchButton/ActionRail's own per-button styling) rather than one large
// backdrop-blurred panel behind them — an earlier full-height bar-with-
// background version read as too heavy for a screen already short on
// vertical room. Orientation-driven (`landscape:`), not width-driven like
// SideRail's `md:` — a phone rotated sideways can be wider or narrower than
// the md breakpoint depending on the device, but it's always
// `orientation: landscape`. Scoped to `max-md` so it never doubles up with
// the real desktop SideRail, which is already visible any time the
// viewport is landscape-shaped.
export function LandscapeSideRail() {
  const pathname = usePathname();
  const directorMode = usePlayerStore((s) => s.directorMode);

  return (
    <motion.nav
      animate={{ opacity: directorMode ? 0 : 1 }}
      transition={CHROME_FADE_TRANSITION}
      aria-label="Primary"
      className={cn(
        "hidden landscape:max-md:flex fixed right-4 top-1/2 -translate-y-1/2 z-40 flex-col items-center gap-3",
        directorMode && "pointer-events-none"
      )}
      style={{ marginRight: "env(safe-area-inset-right)" }}
    >
      {navItems.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        const isUpload = href === "/upload";

        return (
          <Link key={href} href={href} aria-label={label}>
            {isUpload ? (
              // Upload keeps its own distinct shape/color — same rounded-xl
              // "squircle" + primary color BottomNav uses for it in
              // portrait, the one deliberate exception to "every button
              // matches" since it's the single CTA among four destinations.
              <motion.span
                whileTap={{ scale: CHROME_TAP_SCALE }}
                className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary text-bg"
              >
                <Icon size={17} strokeWidth={2.5} />
              </motion.span>
            ) : (
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
            )}
          </Link>
        );
      })}
    </motion.nav>
  );
}
