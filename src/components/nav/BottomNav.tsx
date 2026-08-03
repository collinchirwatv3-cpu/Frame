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
        "md:hidden fixed bottom-0 inset-x-0 z-50 border-t border-border bg-bg/80 backdrop-blur-xl",
        directorMode && "pointer-events-none"
      )}
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="flex items-center justify-around h-16 px-2">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          const isUpload = href === "/upload";

          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-label={label}
                className="flex flex-col items-center justify-center gap-1 py-2"
              >
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
                      className={cn(
                        "transition-colors",
                        active ? "text-accent" : "text-text-secondary"
                      )}
                    />
                  </motion.span>
                )}
                {!isUpload && (
                  <span
                    className={cn(
                      "text-[10px] font-medium tracking-tight transition-colors",
                      active ? "text-accent" : "text-text-secondary"
                    )}
                  >
                    {label}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </motion.nav>
  );
}
