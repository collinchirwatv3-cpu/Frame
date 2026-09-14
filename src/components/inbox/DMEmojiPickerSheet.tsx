"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { EmojiPicker } from "frimousse";
import { setReaction } from "@/lib/dm-reactions";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";
import { cn } from "@/lib/utils";

const SPRING = { type: "spring", stiffness: 420, damping: 38, mass: 0.7 } as const;

/**
 * The full emoji picker, lazy-loaded (see the `next/dynamic` import at the
 * call site in [threadId]/page.tsx) so `frimousse` and the emoji dataset it
 * fetches are never part of ordinary DM loading — nothing downloads until
 * this actually mounts, which only happens once the caller taps "More
 * emojis." One instance is lifted to the thread page rather than mounted
 * per message bubble, both to avoid duplicate data fetches and so there is
 * only ever one overlay to reason about.
 *
 * Emoji data is self-hosted under /public/emoji-data (see that directory's
 * own note) rather than frimousse's jsdelivr default — this app's CSP
 * connect-src only allows 'self' plus Supabase/R2, and a same-origin fetch
 * needs no policy change or new trusted third-party origin.
 */
export function DMEmojiPickerSheet({ messageId, currentEmoji, onReacted, onClose }: {
  messageId: string;
  /** The caller's own current reaction on this message, if any — selecting
   * this same emoji again removes it, exactly like the quick-reaction row. */
  currentEmoji: string | null;
  onReacted: () => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const alive = useRef(true);
  const reducedMotion = usePrefersReducedMotion();
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function handleSelect(emoji: string) {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      await setReaction(messageId, currentEmoji === emoji ? null : emoji);
      if (alive.current) {
        onReacted();
        onClose();
      }
    } catch {
      if (alive.current) setError(true);
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  return (
    <>
      <motion.div
        aria-hidden
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/40"
        initial={reducedMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={reducedMotion ? { duration: 0 } : undefined}
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Choose an emoji"
        className="fixed inset-x-0 bottom-0 z-40 flex flex-col overflow-hidden rounded-t-2xl bg-bg shadow-2xl"
        // Inline style, not a Tailwind arbitrary-value class — `dvh` sizing
        // here needs to be a real, always-applied constraint (this sheet's
        // content can be arbitrarily tall), not dependent on whichever
        // utility classes happen to survive Tailwind's JIT scan.
        style={{ height: "80dvh", maxHeight: "80dvh", paddingBottom: "env(safe-area-inset-bottom)" }}
        initial={reducedMotion ? false : { y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={reducedMotion ? { duration: 0 } : SPRING}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">Choose an emoji</p>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Close emoji picker"
            onClick={onClose}
            className="-m-2 rounded-full p-2 focus-visible:outline-2"
          >
            <X size={18} />
          </button>
        </div>
        <EmojiPicker.Root
          className="flex min-h-0 flex-1 flex-col"
          emojibaseUrl="/emoji-data"
          onEmojiSelect={({ emoji }) => void handleSelect(emoji)}
        >
          <div className="flex shrink-0 items-center gap-2 px-3 py-2">
            <EmojiPicker.Search
              placeholder="Search emoji"
              className="min-w-0 flex-1 rounded-full border border-border bg-card px-3.5 py-2 text-base outline-none focus:border-primary md:text-sm"
            />
            <EmojiPicker.SkinToneSelector
              aria-label="Skin tone"
              className="shrink-0 rounded-full border border-border bg-card p-2 text-lg hover:bg-card/70 focus-visible:outline-2"
            />
          </div>
          <EmojiPicker.Viewport className="min-h-0 flex-1 overflow-y-auto px-2">
            <EmojiPicker.Loading className="flex items-center justify-center py-10 text-xs text-text-secondary">
              Loading…
            </EmojiPicker.Loading>
            <EmojiPicker.Empty className="flex items-center justify-center py-10 text-center text-xs text-text-secondary">
              {({ search }) => <>No emoji found for &quot;{search}&quot;.</>}
            </EmojiPicker.Empty>
            <EmojiPicker.List
              className="pb-6"
              components={{
                CategoryHeader: ({ category, ...props }) => (
                  <div {...props} className="sticky top-0 z-10 bg-bg/95 px-1 py-1.5 text-xs font-semibold text-text-secondary backdrop-blur">
                    {category.label}
                  </div>
                ),
                Row: ({ children, ...props }) => (
                  <div {...props} className="flex gap-0.5">
                    {children}
                  </div>
                ),
                Emoji: ({ emoji, ...props }) => (
                  <button
                    {...props}
                    disabled={busy}
                    aria-pressed={currentEmoji === emoji.emoji}
                    className={cn(
                      "flex aspect-square flex-1 items-center justify-center rounded-lg text-2xl disabled:opacity-50",
                      emoji.isActive && "bg-card",
                      currentEmoji === emoji.emoji && "ring-2 ring-primary"
                    )}
                  >
                    {emoji.emoji}
                  </button>
                ),
              }}
            />
          </EmojiPicker.Viewport>
        </EmojiPicker.Root>
        {error && (
          <p role="alert" className="shrink-0 px-4 py-2 text-xs text-primary">
            Couldn&apos;t save that reaction — try again.
          </p>
        )}
      </motion.div>
    </>
  );
}
