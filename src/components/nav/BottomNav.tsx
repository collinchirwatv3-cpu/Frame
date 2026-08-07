"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { navItems } from "./nav-items";
import { CHROME_FADE_TRANSITION } from "@/lib/motion";
import { usePlayerStore } from "@/store/player-store";

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
        "md:hidden landscape:max-md:hidden fixed bottom-0 inset-x-0 z-50 border-t border-border bg-bg/80 backdrop-blur-xl",
        directorMode && "pointer-events-none"
      )}
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="flex items-center justify-around h-16 px-2">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);

          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-label={label}
                className="flex flex-col items-center justify-center gap-1 py-2"
              >
                <motion.span whileTap={{ scale: 0.85 }}>
                  <Icon
                    size={22}
                    strokeWidth={active ? 2.5 : 1.75}
                    className={cn(
                      "transition-colors",
                      active ? "text-accent" : "text-text-secondary"
                    )}
                  />
                </motion.span>
                <span
                  className={cn(
                    "text-[10px] font-medium tracking-tight transition-colors",
                    active ? "text-accent" : "text-text-secondary"
                  )}
                >
                  {label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </motion.nav>
  );
}
