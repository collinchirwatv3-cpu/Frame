"use client";

import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { CHROME_FADE_TRANSITION } from "@/lib/motion";
import { usePlayerStore } from "@/store/player-store";

export type FeedTab = "forYou" | "following" | "saved" | "history";

export const TABS: { id: FeedTab; label: string }[] = [
  { id: "forYou", label: "For You" },
  { id: "following", label: "Following" },
  { id: "saved", label: "Saved" },
  { id: "history", label: "History" },
];

export function FeedTabs({ active, onChange }: { active: FeedTab; onChange: (tab: FeedTab) => void }) {
  const directorMode = usePlayerStore((s) => s.directorMode);

  return (
    <AnimatePresence>
      {!directorMode && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={CHROME_FADE_TRANSITION}
          className="absolute top-0 inset-x-0 z-20 max-w-[1920px] mx-auto flex justify-start px-4 md:px-8 pt-[calc(env(safe-area-inset-top)+1rem)] pointer-events-none"
        >
      <div className="flex items-center gap-4 overflow-x-auto no-scrollbar pointer-events-auto">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            aria-pressed={active === tab.id}
            className={cn(
              "relative flex-shrink-0 pb-1.5 text-[15px] font-semibold transition-colors drop-shadow-sm",
              active === tab.id ? "text-accent" : "text-accent/55 hover:text-accent/80"
            )}
          >
            {tab.label}
            {active === tab.id && (
              <motion.span
                layoutId="feed-tab-underline"
                className="absolute left-0 right-0 -bottom-0 h-0.5 bg-accent rounded-full"
                transition={{ type: "spring", stiffness: 500, damping: 35 }}
              />
            )}
          </button>
        ))}
      </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
