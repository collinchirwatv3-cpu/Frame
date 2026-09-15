"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { TagTypeahead } from "./TagTypeahead";
import { fetchTagAncestors, fetchTagsByIds } from "@/lib/tags-fetch";
import type { Tag } from "@/lib/types";

/** Single-select, optional. Once a location is picked, shows its resolved
 * breadcrumb (City -> Region -> Country -> Continent) via tag_ancestors —
 * purely informational here; the server resolves and writes the same
 * ancestor chain authoritatively on submit (api/uploads route). */
export function LocationPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (tagId: string | null) => void;
}) {
  const [rawSelected, setRawSelected] = useState<Tag | null>(null);
  const [rawBreadcrumb, setRawBreadcrumb] = useState<Tag[]>([]);
  // Both derived, not reset via a synchronous setState in the effect below
  // — no value means "nothing selected" instantly.
  const selected = value ? rawSelected : null;
  const breadcrumb = value ? rawBreadcrumb : [];

  useEffect(() => {
    if (!value) return;
    fetchTagsByIds([value]).then(([tag]) => setRawSelected(tag ?? null));
    fetchTagAncestors(value).then(setRawBreadcrumb);
  }, [value]);

  if (selected) {
    return (
      <div>
        <label className="text-sm font-medium mb-1.5 block">Location</label>
        <div className="flex items-center justify-between gap-2 bg-card border border-border rounded-xl px-4 py-2.5 text-sm">
          <span className="truncate">
            {[...breadcrumb.map((t) => t.name).reverse(), selected.name].join(" · ")}
          </span>
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label="Remove location"
            className="w-5 h-5 rounded-full flex items-center justify-center hover:bg-bg transition-colors shrink-0"
          >
            <X size={13} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <label className="text-sm font-medium mb-1.5 block">Location</label>
      <TagTypeahead categoryIds={["location"]} placeholder="Search a city or country…" onSelect={(tag) => onChange(tag.id)} />
    </div>
  );
}
