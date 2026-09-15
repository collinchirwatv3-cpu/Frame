"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEscapeToClose } from "@/lib/use-escape-to-close";
import { fetchTagsByCategories, fetchTagsByIds } from "@/lib/tags-fetch";
import type { Tag } from "@/lib/types";

/** Dropdown counterpart to TagMultiSelect, for categories small enough to
 * show in full (Genre ~80 tags, Topic's 5 categories combined) — a closed
 * trigger button opens a panel with every option plus a client-side
 * filter box, and selection is a checklist rather than "type to search,
 * pick a result, it becomes a chip below." Gear/Location stay on
 * TagTypeahead: hundreds of tags is too many to ever show in full, so
 * server-side search-as-you-type is still the right interaction there. */
export function TagDropdownMultiSelect({
  label,
  categoryIds,
  max,
  value,
  onChange,
  required = false,
}: {
  label: string;
  categoryIds: string[];
  max: number;
  value: string[];
  onChange: (ids: string[]) => void;
  required?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<Tag[]>([]);
  const [selected, setSelected] = useState<Tag[]>([]);
  // Same lazy-hydration convention as TagMultiSelect: an empty starting
  // value means "already hydrated," no fetch needed just to show nothing.
  const [hydrated, setHydrated] = useState(() => value.length === 0);

  useEffect(() => {
    fetchTagsByCategories(categoryIds).then(setOptions);
    // categoryIds is a fresh array literal from the caller every render —
    // fetch once, same reasoning as GearPicker's identical exclusion.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (hydrated) return;
    fetchTagsByIds(value).then((tags) => {
      setSelected(tags);
      setHydrated(true);
    });
  }, [value, hydrated]);

  useEscapeToClose(open, () => setOpen(false));

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const filtered = query.trim()
    ? options.filter((t) => t.name.toLowerCase().includes(query.trim().toLowerCase()))
    : options;

  function toggle(tag: Tag) {
    const isSelected = selected.some((t) => t.id === tag.id);
    if (!isSelected && selected.length >= max) return;
    const next = isSelected ? selected.filter((t) => t.id !== tag.id) : [...selected, tag];
    setSelected(next);
    onChange(next.map((t) => t.id));
  }

  return (
    <div ref={containerRef} className="relative">
      <label className="text-sm font-medium mb-1.5 flex items-center justify-between">
        <span>
          {label} {required && <span className="text-primary">*</span>}
        </span>
        <span className="text-xs text-text-secondary font-normal">
          {selected.length}/{max}
        </span>
      </label>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 bg-card border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary transition-colors text-left"
      >
        <span className={cn("truncate", selected.length === 0 && "text-text-secondary")}>
          {selected.length > 0 ? selected.map((t) => t.name).join(", ") : `Select ${label.toLowerCase()}…`}
        </span>
        <ChevronDown
          size={16}
          className={cn("text-text-secondary transition-transform shrink-0", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="absolute z-10 mt-1 w-full rounded-xl border border-border bg-card shadow-lg overflow-hidden">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${label.toLowerCase()}…`}
            className="w-full px-4 py-2.5 text-sm bg-transparent outline-none border-b border-border"
          />
          <div role="listbox" aria-multiselectable="true" className="max-h-56 overflow-y-auto">
            {filtered.length === 0 && <div className="px-4 py-2.5 text-xs text-text-secondary">No matches</div>}
            {filtered.map((tag) => {
              const isSelected = selected.some((t) => t.id === tag.id);
              const disabled = !isSelected && selected.length >= max;
              return (
                <button
                  key={tag.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  disabled={disabled}
                  onClick={() => toggle(tag)}
                  className={cn(
                    "w-full text-left px-4 py-2.5 text-sm hover:bg-bg transition-colors flex items-center justify-between gap-2 disabled:opacity-40 disabled:cursor-not-allowed",
                    isSelected && "text-primary"
                  )}
                >
                  <span className="truncate">{tag.name}</span>
                  {isSelected && <Check size={14} className="shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
