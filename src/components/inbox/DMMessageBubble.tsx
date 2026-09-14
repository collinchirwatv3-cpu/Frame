"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useMotionValue, useTransform, animate, type AnimationPlaybackControls } from "framer-motion";
import { MoreHorizontal, Plus, Reply } from "lucide-react";
import { cn, formatRelativeTime } from "@/lib/utils";
import type { DMMessage } from "@/lib/dm";
import { DM_REACTIONS, setReaction, type DMReaction } from "@/lib/dm-reactions";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";

// Matches the release-time reply threshold this file has always used
// (DMMessageBubble.test.tsx's swipe tests assert against these exact
// numbers) — 60px of real finger travel commits to reply; anything less
// springs back with no effect. MAX_VISUAL_DRAG bounds how far the bubble
// itself can visually travel even if the finger keeps going.
const REPLY_THRESHOLD = 60;
const MAX_VISUAL_DRAG = 96;
const HOLD_DELAY = 450;
const CANCEL_HOLD_DISTANCE = 10;
const VERTICAL_CANCEL_DISTANCE = 24;
const SPRING_BACK = { type: "spring", stiffness: 500, damping: 34, mass: 0.6 } as const;

/** 1:1 tracking up to the reply threshold, then increasing resistance
 * beyond it (WhatsApp-style rubber-banding) — the bubble keeps moving with
 * the finger past the commit point, but visibly slower, and never past
 * MAX_VISUAL_DRAG. A leftward drag (or no drag) never moves the bubble —
 * this gesture is one-directional. */
function resistedOffset(rawDx: number): number {
  if (rawDx <= 0) return 0;
  if (rawDx <= REPLY_THRESHOLD) return rawDx;
  const overshoot = rawDx - REPLY_THRESHOLD;
  return Math.min(REPLY_THRESHOLD + overshoot * 0.35, MAX_VISUAL_DRAG);
}

export function DMMessageBubble({ message, userId, otherName, disabled, reactions, onReply, onReactionChange, onOpenPicker }: {
  message: DMMessage;
  userId: string;
  otherName: string;
  disabled: boolean;
  reactions: DMReaction[];
  onReply: (message: DMMessage) => void;
  onReactionChange: () => void;
  /** Opens the full emoji picker for this message — the heavy picker UI
   * itself lives once, lifted to the thread page, not one instance per
   * bubble; this just tells the caller which message it's for. Also
   * passes the PERSISTENT "Message actions" button (not the "More emojis"
   * button, which unmounts the instant the local actions menu closes) so
   * the picker can restore focus to something that's actually still in
   * the DOM once it closes. */
  onOpenPicker: (message: DMMessage, trigger: HTMLElement | null) => void;
}) {
  const own = message.senderId === userId;
  // Grouped by ALL distinct emoji actually present, not just the 6 quick
  // reactions — a reaction picked via the full picker must still show up
  // in the summary row below the message.
  const groupedReactions = useMemo(() => {
    const groups = new Map<string, DMReaction[]>();
    for (const r of reactions) groups.set(r.emoji, [...(groups.get(r.emoji) ?? []), r]);
    return [...groups.entries()];
  }, [reactions]);
  const [actions, setActions] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const replyButton = useRef<HTMLButtonElement>(null);
  const alive = useRef(true);
  const cancelHold = () => { if (hold.current) clearTimeout(hold.current); hold.current = null; };

  // The bubble's own visual swipe offset — a framer-motion value, not React
  // state, so dragging never re-renders this component (let alone the rest
  // of the conversation) on every touchmove. `dragEngaged` distinguishes
  // "actively tracking a horizontal swipe" from the ambiguous first few
  // pixels of any touch; `committed` mirrors whether the RAW (unresisted)
  // drag distance has crossed REPLY_THRESHOLD, independent of the visual
  // (resisted) position, and drives the reply-arrow indicator.
  const reducedMotion = usePrefersReducedMotion();
  const dragX = useMotionValue(0);
  const dragEngaged = useRef(false);
  const committed = useRef(false);
  const springRef = useRef<AnimationPlaybackControls | null>(null);
  // Under reduced motion the bubble never visually moves at all (dragX
  // stays 0), so the arrow indicator can't derive from it — this discrete,
  // rarely-updated boolean (only flips at the moment the threshold is
  // crossed/uncrossed, never per-pixel) stands in for it instead.
  const [reducedMotionReady, setReducedMotionReady] = useState(false);
  const arrowOpacity = useTransform(dragX, [0, REPLY_THRESHOLD], [0, 1]);
  const arrowScale = useTransform(dragX, [0, REPLY_THRESHOLD, REPLY_THRESHOLD + 0.01], [0.5, 1, 1.15]);

  function resetDrag() {
    dragEngaged.current = false;
    if (committed.current) {
      committed.current = false;
      if (reducedMotion) setReducedMotionReady(false);
    }
    if (!reducedMotion) {
      springRef.current?.stop();
      springRef.current = animate(dragX, 0, SPRING_BACK);
    }
  }

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (hold.current) clearTimeout(hold.current);
      springRef.current?.stop();
    };
  }, []);
  useEffect(() => { if (actions) replyButton.current?.focus(); }, [actions]);
  // Disabling mid-gesture (a block landing in realtime while dragging) —
  // the identity change unmounts this instance on navigation anyway, but a
  // `disabled` flip on the SAME instance should also cancel cleanly. Runs
  // every render (deliberately no dep array, matching this codebase's own
  // "always-current" effect pattern), but is a no-op unless a gesture is
  // actually in progress.
  useEffect(() => {
    if (disabled && (dragEngaged.current || touch.current)) {
      cancelHold();
      touch.current = null;
      resetDrag();
    }
  });

  function reply() {
    if (disabled) return;
    setActions(false);
    onReply(message);
  }
  async function react(emoji: string) {
    if (disabled || busy) return;
    setBusy(true);
    setError(false);
    try {
      const selected = reactions.find((r) => r.userId === userId)?.emoji === emoji;
      await setReaction(message.id, selected ? null : emoji);
      if (alive.current) {
        setActions(false);
        onReactionChange();
        menuButton.current?.focus();
      }
    } catch {
      if (alive.current) setError(true);
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  return (
    <div className={cn("max-w-[85%] sm:max-w-[75%] min-w-0", own ? "self-end" : "self-start")}>
      <div className="relative">
        {!disabled && (
          <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5">
            {reducedMotion ? (
              <Reply size={18} className={cn("transition-opacity", reducedMotionReady ? "text-primary opacity-100" : "text-text-secondary opacity-0")} />
            ) : (
              <motion.div style={{ opacity: arrowOpacity, scale: arrowScale }}>
                <Reply size={18} className="text-primary" />
              </motion.div>
            )}
          </div>
        )}
        <motion.div
          style={{ x: reducedMotion ? 0 : dragX }}
          className={cn("relative px-3.5 py-2 rounded-2xl text-sm touch-pan-y", own ? "bg-primary text-bg" : "bg-card")}
          onTouchStart={(e) => {
            if (disabled || e.touches.length !== 1) return;
            if ((e.target as HTMLElement).closest("button, a, [role='button'], input, textarea, select")) return;
            cancelHold();
            held.current = false;
            dragEngaged.current = false;
            touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            hold.current = setTimeout(() => { held.current = true; setActions(true); }, HOLD_DELAY);
          }}
          onTouchMove={(e) => {
            if (!touch.current) return;
            if (e.touches.length !== 1) { cancelHold(); touch.current = null; resetDrag(); return; }
            const dx = e.touches[0].clientX - touch.current.x;
            const dy = e.touches[0].clientY - touch.current.y;
            if (Math.abs(dx) > CANCEL_HOLD_DISTANCE || Math.abs(dy) > CANCEL_HOLD_DISTANCE) cancelHold();
            if (Math.abs(dy) > VERTICAL_CANCEL_DISTANCE) { touch.current = null; resetDrag(); return; }
            if (dx > CANCEL_HOLD_DISTANCE) {
              dragEngaged.current = true;
              if (!reducedMotion) dragX.set(resistedOffset(dx));
              const ready = dx >= REPLY_THRESHOLD;
              if (ready !== committed.current) {
                committed.current = ready;
                if (reducedMotion) setReducedMotionReady(ready);
              }
            }
          }}
          onTouchEnd={(e) => {
            cancelHold();
            const start = touch.current;
            touch.current = null;
            const end = e.changedTouches[0];
            const shouldReply = !held.current && start && end && end.clientX - start.x >= REPLY_THRESHOLD && Math.abs(end.clientY - start.y) < VERTICAL_CANCEL_DISTANCE;
            resetDrag();
            if (shouldReply) reply();
          }}
          onTouchCancel={() => { cancelHold(); touch.current = null; resetDrag(); }}
        >
          {message.replyToId && (
            <blockquote className="border-l-2 border-current/40 pl-2 mb-2 opacity-80">
              <p className="text-[11px] font-semibold">{message.replyTo ? message.replyTo.senderId === userId ? "You" : otherName : "Original message"}</p>
              <p className="text-xs line-clamp-2 break-words whitespace-pre-wrap">{message.replyTo?.text ?? "Message unavailable"}</p>
            </blockquote>
          )}
          <p className="whitespace-pre-wrap break-words">{message.text}</p>
          <div className="flex items-center justify-between gap-3 mt-1">
            <p className={cn("text-[10px]", own ? "text-bg/70" : "text-text-secondary")}>{formatRelativeTime(message.createdAt)}</p>
            {!disabled && <button ref={menuButton} type="button" aria-label="Message actions" aria-expanded={actions}
              onClick={() => setActions((open) => !open)} className="p-2 -my-1 -mr-2 rounded-full focus-visible:outline-2">
              <MoreHorizontal size={16} />
            </button>}
          </div>
        </motion.div>
      </div>
      {actions && !disabled && (
        <div role="group" aria-label="Message actions" className="mt-1 rounded-xl border border-border bg-card p-2"
          onKeyDown={(e) => { if (e.key === "Escape") { setActions(false); menuButton.current?.focus(); } }}>
          <button ref={replyButton} type="button" onClick={reply} className="flex items-center gap-2 text-xs p-2"><Reply size={15} />Reply</button>
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label="React to message">
            {DM_REACTIONS.map(({ emoji, label }) => <button key={emoji} type="button" aria-label={label}
              aria-pressed={reactions.some((r) => r.userId === userId && r.emoji === emoji)} disabled={busy}
              onClick={() => void react(emoji)} className="p-2 text-xl rounded-lg hover:bg-bg disabled:opacity-50">{emoji}</button>)}
            <button type="button" aria-label="More emojis" disabled={busy}
              onClick={() => { setActions(false); onOpenPicker(message, menuButton.current); }}
              className="p-2 rounded-lg hover:bg-bg disabled:opacity-50 text-text-secondary">
              <Plus size={18} />
            </button>
          </div>
          <button type="button" onClick={() => { setActions(false); menuButton.current?.focus(); }} className="text-xs p-2">Close</button>
        </div>
      )}
      {groupedReactions.length > 0 && <div className="flex flex-wrap gap-1 mt-1" aria-label="Message reactions">
        {groupedReactions.map(([emoji, matching]) => {
          const selected = matching.some((r) => r.userId === userId);
          const label = DM_REACTIONS.find((r) => r.emoji === emoji)?.label ?? emoji;
          return <button type="button" key={emoji} aria-label={`${label}, ${matching.length}${selected ? ", including you" : ""}`}
            aria-pressed={selected} disabled={disabled || busy} onClick={() => void react(emoji)}
            className={cn("px-2 py-1 rounded-full border text-xs", selected ? "border-primary bg-primary/10" : "border-border bg-card")}>
            {emoji} {matching.length}
          </button>;
        })}
      </div>}
      {error && <p role="alert" className="text-xs text-primary mt-1">Couldn&apos;t update reaction. Try again.</p>}
    </div>
  );
}
