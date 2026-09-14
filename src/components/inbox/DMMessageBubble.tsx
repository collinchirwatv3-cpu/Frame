"use client";

import { useEffect, useRef, useState } from "react";
import { MoreHorizontal, Reply } from "lucide-react";
import { cn, formatRelativeTime } from "@/lib/utils";
import type { DMMessage } from "@/lib/dm";
import { DM_REACTIONS, setReaction, type DMEmoji, type DMReaction } from "@/lib/dm-reactions";

export function DMMessageBubble({ message, userId, otherName, disabled, reactions, onReply, onReactionChange }: {
  message: DMMessage;
  userId: string;
  otherName: string;
  disabled: boolean;
  reactions: DMReaction[];
  onReply: (message: DMMessage) => void;
  onReactionChange: () => void;
}) {
  const own = message.senderId === userId;
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
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; if (hold.current) clearTimeout(hold.current); };
  }, []);
  useEffect(() => { if (actions) replyButton.current?.focus(); }, [actions]);

  function reply() {
    if (disabled) return;
    setActions(false);
    onReply(message);
  }
  async function react(emoji: DMEmoji) {
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
      <div
        className={cn("relative px-3.5 py-2 rounded-2xl text-sm touch-pan-y", own ? "bg-primary text-bg" : "bg-card")}
        onTouchStart={(e) => {
          if (disabled || e.touches.length !== 1) return;
          cancelHold();
          held.current = false;
          touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
          hold.current = setTimeout(() => { held.current = true; setActions(true); }, 450);
        }}
        onTouchMove={(e) => {
          if (!touch.current) return;
          if (e.touches.length !== 1) { cancelHold(); touch.current = null; return; }
          const dx = e.touches[0].clientX - touch.current.x;
          const dy = e.touches[0].clientY - touch.current.y;
          if (Math.abs(dx) > 10 || Math.abs(dy) > 10) cancelHold();
          if (Math.abs(dy) > 24) touch.current = null;
        }}
        onTouchEnd={(e) => {
          cancelHold();
          const start = touch.current;
          touch.current = null;
          const end = e.changedTouches[0];
          if (!held.current && start && end && end.clientX - start.x >= 60 && Math.abs(end.clientY - start.y) < 24) reply();
        }}
        onTouchCancel={() => { cancelHold(); touch.current = null; }}
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
      </div>
      {actions && !disabled && (
        <div role="group" aria-label="Message actions" className="mt-1 rounded-xl border border-border bg-card p-2"
          onKeyDown={(e) => { if (e.key === "Escape") { setActions(false); menuButton.current?.focus(); } }}>
          <button ref={replyButton} type="button" onClick={reply} className="flex items-center gap-2 text-xs p-2"><Reply size={15} />Reply</button>
          <div className="flex flex-wrap gap-1" role="group" aria-label="React to message">
            {DM_REACTIONS.map(({ emoji, label }) => <button key={emoji} type="button" aria-label={label}
              aria-pressed={reactions.some((r) => r.userId === userId && r.emoji === emoji)} disabled={busy}
              onClick={() => void react(emoji)} className="p-2 text-xl rounded-lg hover:bg-bg disabled:opacity-50">{emoji}</button>)}
          </div>
          <button type="button" onClick={() => { setActions(false); menuButton.current?.focus(); }} className="text-xs p-2">Close</button>
        </div>
      )}
      {reactions.length > 0 && <div className="flex flex-wrap gap-1 mt-1" aria-label="Message reactions">
        {DM_REACTIONS.map(({ emoji, label }) => {
          const matching = reactions.filter((r) => r.emoji === emoji);
          if (!matching.length) return null;
          const selected = matching.some((r) => r.userId === userId);
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
