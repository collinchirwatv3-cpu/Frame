"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** Wraps an optional tag picker (Mood, Location, Gear) so its typeahead
 * isn't taking up scroll space for every creator who has nothing to say
 * there — mirrors OptionCard's collapse pattern (UploadRejection.tsx) for
 * visual consistency with the rest of the upload flow. Required fields
 * (Content type, Genre, Topic) deliberately stay outside this component,
 * always visible — collapsing something a creator MUST fill in just to
 * publish is a good way for it to get missed entirely. */
export function CollapsibleTagSection({
  title,
  summary,
  defaultOpen = false,
  children,
}: {
  title: string;
  /** Short collapsed-state hint, e.g. "2 selected" or "Not set" — a count,
   * not the actual tag names, so this never needs its own fetch beyond
   * what the draft store's id arrays already give the parent for free. */
  summary: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

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
