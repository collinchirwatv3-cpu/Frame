"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { TagTypeahead } from "./TagTypeahead";
import { fetchTagsByIds } from "@/lib/tags-fetch";
import type { Tag } from "@/lib/types";

/** Generic capped multi-select, reused for Genre (max 3), Topic (max 5),
 * and Mood (max 3, spanning both Mood & Tone and Visual Style facets per
 * the mapping decision in the tag taxonomy plan). Chips + a typeahead that
 * disappears once the cap is hit. */
export function TagMultiSelect({
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
  const [selected, setSelected] = useState<Tag[]>([]);
  // Lazy-initialized from value's length at mount, not reset via a
  // synchronous setState in the effect below — an empty starting value
  // means "already hydrated, nothing to fetch" instantly.
  const [hydrated, setHydrated] = useState(() => value.length === 0);

  // Hydrates chip labels for ids restored from a persisted draft — once.
  // After that, addTag/removeTag below keep `selected` and the ids passed
  // up via onChange in sync directly, no more refetching on every change.
  useEffect(() => {
    if (hydrated) return;
    fetchTagsByIds(value).then((tags) => {
      setSelected(tags);
      setHydrated(true);
    });
  }, [value, hydrated]);

  function addTag(tag: Tag) {
    if (selected.length >= max || selected.some((t) => t.id === tag.id)) return;
    const next = [...selected, tag];
    setSelected(next);
    onChange(next.map((t) => t.id));
  }

  function removeTag(id: string) {
    const next = selected.filter((t) => t.id !== id);
    setSelected(next);
    onChange(next.map((t) => t.id));
  }

  return (
    <div>
      <label className="text-sm font-medium mb-1.5 flex items-center justify-between">
        <span>
          {label} {required && <span className="text-primary">*</span>}
        </span>
        <span className="text-xs text-text-secondary font-normal">
          {selected.length}/{max}
        </span>
      </label>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selected.map((tag) => (
            <span
              key={tag.id}
              className="inline-flex items-center gap-1 pl-3 pr-1.5 py-1 rounded-full bg-card border border-border text-xs"
            >
              {tag.name}
              <button
                type="button"
                onClick={() => removeTag(tag.id)}
                aria-label={`Remove ${tag.name}`}
                className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-bg transition-colors"
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
      {selected.length < max && (
        <TagTypeahead
          categoryIds={categoryIds}
          placeholder={`Add ${label.toLowerCase()}…`}
          onSelect={addTag}
          excludeIds={selected.map((t) => t.id)}
        />
      )}
    </div>
  );
}
