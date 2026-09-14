"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { EmojiPicker } from "frimousse";
import { setReaction } from "@/lib/dm-reactions";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";
import { useEscapeToClose } from "@/lib/use-escape-to-close";
import { useVisualViewportBounds } from "@/lib/use-visual-viewport-bounds";
import { cn } from "@/lib/utils";

const SPRING = { type: "spring", stiffness: 420, damping: 38, mass: 0.7 } as const;
const HEIGHT_FRACTION = 0.8;
// Broad candidate selector — narrowed below by the actual `.tabIndex` IDL
// property (not a `[tabindex="-1"]` attribute-string match, which can't
// express "negative", "not overridden", or any other non-"-1" value) plus
// a hidden-ancestor check. Frimousse's own emoji-grid cells are real
// `<button>`s but every one carries an explicit `tabIndex: -1` (arrow-key
// navigation there moves a virtual "active" cell, never real DOM focus),
// and its row/category-header size-probing elements are rendered inside an
// `aria-hidden="true"` wrapper — neither is an actual tab stop, and a
// selector alone can't reliably distinguish them from the picker's own
// Close/Search/SkinTone controls.
const FOCUSABLE_SELECTOR = "button:not([disabled]), [href], input:not([disabled]), [tabindex]";

/** True if `el` (or any ancestor up to and including `boundary`) is
 * `hidden` or `aria-hidden="true"` — used to keep the focus trap off
 * Frimousse's offscreen sizing elements. */
function hasHiddenAncestor(el: HTMLElement, boundary: HTMLElement): boolean {
  let node: HTMLElement | null = el;
  while (node) {
    if (node.hidden || node.getAttribute("aria-hidden") === "true") return true;
    if (node === boundary) return false;
    node = node.parentElement;
  }
  return false;
}

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
  const dialogRef = useRef<HTMLDivElement>(null);
  // This component is only ever mounted by the caller while the picker is
  // open (page.tsx renders it conditionally) — "open" is always true from
  // its own point of view, so this reuses the same shared Escape-to-close
  // behavior every other sheet/modal in the app already uses instead of a
  // second, duplicate keydown listener.
  useEscapeToClose(true, onClose);
  // Viewport-aware sizing — see use-visual-viewport-bounds.ts. Falls back
  // to a static 80dvh (this sheet's original behavior) when
  // visualViewport isn't available at all (older browsers, some test
  // environments) rather than rendering with no height constraint.
  const bounds = useVisualViewportBounds(HEIGHT_FRACTION);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  // Focus trap: Tab/Shift+Tab cycle only through this dialog's own
  // focusable elements while it's open, so keyboard focus can never
  // escape into (and the backdrop's own full-viewport overlay already
  // blocks pointer access to) the conversation behind it.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab" || !dialogRef.current) return;
      const dialog = dialogRef.current;
      // Recomputed on every Tab press (not cached) so this stays correct
      // as the picker's own content changes underneath it — a search
      // filtering the emoji grid, or a pending mutation disabling it,
      // never touch the actual tab stops (Close/Search/SkinTone all stay
      // enabled throughout), but this still re-derives from the live DOM
      // rather than trusting a snapshot.
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => el.tabIndex >= 0 && !hasHiddenAncestor(el, dialog)
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeEl = document.activeElement;
      if (e.shiftKey && activeEl === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && activeEl === last) {
        e.preventDefault();
        first.focus();
      } else if (!dialog.contains(activeEl)) {
        // Focus somehow ended up outside the dialog (e.g. a programmatic
        // .focus() elsewhere) — pull it back in rather than letting Tab
        // continue from wherever it landed.
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

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
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Choose an emoji"
        className="fixed inset-x-0 z-40 flex flex-col overflow-hidden rounded-t-2xl bg-bg shadow-2xl"
        // Inline style, not a Tailwind arbitrary-value class — sizing here
        // needs to be a real, always-applied constraint (this sheet's
        // content can be arbitrarily tall) that tracks the ACTUAL visible
        // viewport as an on-screen keyboard opens, closes, or pans it, not
        // a static dvh guess that has no way to react to any of that.
        // Falls back to a static 80dvh anchored to the layout viewport's
        // own bottom when visualViewport isn't available at all.
        style={
          bounds
            ? { height: bounds.height, bottom: bounds.bottomInset, paddingBottom: "env(safe-area-inset-bottom)" }
            : { height: "80dvh", maxHeight: "80dvh", bottom: 0, paddingBottom: "env(safe-area-inset-bottom)" }
        }
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
