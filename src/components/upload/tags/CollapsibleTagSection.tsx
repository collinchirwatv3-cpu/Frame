"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** Collapses a tag picker (or group of pickers) behind a single header —
 * mirrors OptionCard's collapse pattern (UploadRejection.tsx) for visual
 * consistency with the rest of the upload flow. Content type stays
 * outside this entirely (its own always-visible required field, a
 * single-select native <select> rather than a tag facet); everything else
 * — including required facets like Genre/Topic — can live inside one of
 * these, as long as a validation failure can force it back open via
 * `forceOpen` so a required selection never gets stuck out of sight. */
export function CollapsibleTagSection({
  title,
  summary,
  defaultOpen = false,
  forceOpen = false,
  children,
}: {
  title: string;
  /** Short collapsed-state hint, e.g. "2 selected" or "Not set" — a count,
   * not the actual tag names, so this never needs its own fetch beyond
   * what the draft store's id arrays already give the parent for free. */
  summary: string;
  defaultOpen?: boolean;
  /** Set true (e.g. on a submit-time validation error) to force this open
   * regardless of the user's own last toggle — never used to force it
   * closed again, so becoming false afterward doesn't re-collapse it. */
  forceOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen || forceOpen);
  // React's own "adjust state during render" pattern (not an effect — a
  // setState inside useEffect here would cascade an extra render for no
  // benefit) for reacting to forceOpen turning true, without needing a
  // ref: track the last forceOpen value alongside it, and when they
  // disagree, this render both corrects that tracker and opens the
  // section in one pass, before anything paints. The `open` initializer
  // above already covers forceOpen being true from the very first render
  // (this only needs to catch it becoming true later).
  const [lastForceOpen, setLastForceOpen] = useState(forceOpen);
  if (forceOpen !== lastForceOpen) {
    setLastForceOpen(forceOpen);
    if (forceOpen) setOpen(true);
  }

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-card/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-card/60 transition-colors"
      >
        <span className="text-sm font-medium">{title}</span>
        <span className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-text-secondary">{summary}</span>
          <ChevronDown
            size={16}
            className={cn("text-text-secondary transition-transform", open && "rotate-180")}
          />
        </span>
      </button>
      {open && <div className="px-4 pb-4 pt-1">{children}</div>}
    </div>
  );
}
