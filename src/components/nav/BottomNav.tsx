"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { navItems } from "./nav-items";
import { CHROME_FADE_TRANSITION } from "@/lib/motion";
import { CHROME_GLASS_CLASS, CHROME_TAP_SCALE } from "@/lib/chrome";
import { usePlayerStore } from "@/store/player-store";

// Floating pill instead of the old edge-to-edge bar — icon-only, inset from
// every edge rather than flush against the bottom, same glass treatment
// (CHROME_GLASS_CLASS) as every other piece of chrome now uses. Labels
// dropped: a floating pill reads as a compact, self-contained control, not
// a full app-chrome bar, and the five icons are distinct enough on their
// own (matches the reference this was modeled on).
export function BottomNav() {
  const pathname = usePathname();
  const directorMode = usePlayerStore((s) => s.directorMode);

  return (
    <motion.nav
      animate={{ opacity: directorMode ? 0 : 1 }}
      transition={CHROME_FADE_TRANSITION}
      className={cn(
        // landscape:max-md:hidden — a phone turned sideways gets
        // LandscapeSideRail on the right edge instead (see that
        // component's comment for why).
        "md:hidden landscape:max-md:hidden fixed bottom-4 inset-x-4 z-50 mx-auto max-w-sm",
        CHROME_GLASS_CLASS,
        directorMode && "pointer-events-none"
      )}
      style={{ marginBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="flex items-center justify-between px-3 py-2.5">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);

          return (
            <li key={href}>
              <Link href={href} aria-label={label} className="flex items-center justify-center p-1">
                <motion.span
                  whileTap={{ scale: CHROME_TAP_SCALE }}
                  className={cn(
                    "flex items-center justify-center w-10 h-10 rounded-full transition-colors",
                    active && "bg-accent/10"
                  )}
                >
                  <Icon
                    size={22}
                    strokeWidth={active ? 2.5 : 1.75}
                    className={cn(
                      "transition-colors",
                      active ? "text-accent" : "text-text-secondary"
                    )}
                  />
                </motion.span>
              </Link>
            </li>
          );
        })}
      </ul>
    </motion.nav>
  );
}
