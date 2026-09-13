"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { navItems } from "./nav-items";
import { CHROME_FADE_TRANSITION } from "@/lib/motion";
import { CHROME_GLASS_CLASS, CHROME_TAP_SCALE } from "@/lib/chrome";
import { usePlayerStore } from "@/store/player-store";

// Floating pill instead of the old edge-to-edge bar — icon-only for
// inactive destinations, inset from every edge rather than flush against
// the bottom, same glass treatment (CHROME_GLASS_CLASS) as every other
// piece of chrome now uses. The active destination gets a visible text
// label next to its icon (layout-animated in/out) rather than every item
// carrying one — first-use clarity without turning this into a
// conventional five-label tab bar, which the reference this was modeled on
// deliberately avoids.
export function BottomNav() {
  const pathname = usePathname();
  const directorMode = usePlayerStore((s) => s.directorMode);

  return (
    <motion.nav
      animate={{ opacity: directorMode ? 0 : 1 }}
      transition={CHROME_FADE_TRANSITION}
      aria-label="Primary"
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
                  layout
                  whileTap={{ scale: CHROME_TAP_SCALE }}
                  className={cn(
                    "flex items-center justify-center h-10 rounded-full transition-colors gap-1.5",
                    active ? "px-3.5 bg-accent/10" : "w-10"
                  )}
                >
                  <Icon
                    size={22}
                    strokeWidth={active ? 2.5 : 1.75}
                    className={cn(
                      "transition-colors shrink-0",
                      active ? "text-accent" : "text-text-secondary"
                    )}
                  />
                  {active && (
                    <span className="text-xs font-semibold text-accent whitespace-nowrap">
                      {label}
                    </span>
                  )}
                </motion.span>
              </Link>
            </li>
          );
        })}
      </ul>
    </motion.nav>
  );
}
