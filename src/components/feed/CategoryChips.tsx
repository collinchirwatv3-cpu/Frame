"use client";

import { AnimatePresence, motion } from "framer-motion";
import { categories } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { CHROME_FADE_TRANSITION } from "@/lib/motion";
import { usePlayerStore } from "@/store/player-store";
import type { Category } from "@/lib/types";

/** `null` means "All" — not a real category, just clears the filter. */
export const CATEGORY_CHIPS: { label: string; value: Category | null }[] = [
  { label: "All", value: null },
  ...categories.map((c) => ({ label: c, value: c })),
];

type Props = { active: Category | null; onChange: (category: Category | null) => void };

/** Horizontally-scrollable category filter, always present on Home under
 * the For You/Following/Saved/History tabs, narrowing whichever tab is
 * currently active — same idea as YouTube's topic-chip row. Floats over
 * video content (SwipeFeed) the same way FeedTabs does, positioned a row
 * below it rather than sharing one container, so this and FeedTabs can be
 * shown independently (chips still show for a signed-out visitor who has
 * no tab switcher at all). See FeedRoot's portrait-grid branch for the
 * plain (non-floating) rendering of the same CATEGORY_CHIPS list. */
export function CategoryChips({ active, onChange }: Props) {
  const directorMode = usePlayerStore((s) => s.directorMode);

  return (
    <AnimatePresence>
      {!directorMode && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={CHROME_FADE_TRANSITION}
          className="absolute top-0 inset-x-0 z-20 max-w-[1920px] mx-auto pt-[calc(env(safe-area-inset-top)+3.5rem)] px-4 md:px-8 pointer-events-none"
        >
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pointer-events-auto">
            {CATEGORY_CHIPS.map(({ label, value }) => {
              const isActive = active === value;
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => onChange(value)}
                  aria-pressed={isActive}
                  className={cn(
                    "flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold backdrop-blur-md transition-colors",
                    isActive
                      ? "bg-primary text-bg"
                      : "bg-card/70 text-text-secondary hover:text-accent"
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
