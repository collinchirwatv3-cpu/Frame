"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { TagTypeahead } from "./TagTypeahead";
import { fetchTagsByIds, fetchTagImplications } from "@/lib/tags-fetch";
import type { Tag } from "@/lib/types";

/** One instance per gear sub-facet (camera, lens, lighting, audio, support,
 * movement, format, post-production, craft). All instances share one flat
 * `value` array (upload-draft-store's single gearTagIds) — each picker
 * only DISPLAYS the slice whose tag actually belongs to its own
 * categoryIds (fetched and filtered client-side; a shared array with no
 * filtering would show every gear tag in every picker), and on add/remove
 * merges its own change back into the FULL shared array via `onChange`
 * rather than replacing it wholesale, so sibling pickers' selections
 * aren't clobbered.
 *
 * Unlike TagMultiSelect, no cap — "select one or more" per the spec. Shows
 * a lightweight "also tags: …" hint once something's picked, previewing
 * tag_implies client-side purely for creator transparency; the server
 * (api/uploads route) resolves inheritance authoritatively regardless of
 * what's shown here. */
export function GearPicker({
  label,
  categoryIds,
  value,
  onChange,
}: {
  label: string;
  categoryIds: string[];
  value: string[];
  onChange: (allGearTagIds: string[]) => void;
}) {
  const [rawOwnSelected, setRawOwnSelected] = useState<Tag[]>([]);
  const [rawImplied, setRawImplied] = useState<Tag[]>([]);
  // Both derived, not reset via a synchronous setState in an effect — an
  // empty value/selection means "nothing to show" instantly, without
  // waiting on (or triggering) either effect below.
  const ownSelected = value.length === 0 ? [] : rawOwnSelected;
  const implied = ownSelected.length === 0 ? [] : rawImplied;

  useEffect(() => {
    if (value.length === 0) return;
    let cancelled = false;
    fetchTagsByIds(value).then((tags) => {
      if (cancelled) return;
      setRawOwnSelected(tags.filter((t) => categoryIds.includes(t.categoryId)));
    });
    return () => {
      cancelled = true;
    };
    // categoryIds intentionally excluded — it's a literal array each
    // caller passes fresh every render; identity changes shouldn't
    // re-trigger a refetch, only the actual selected ids changing should.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    if (ownSelected.length === 0) return;
    fetchTagImplications(ownSelected.map((t) => t.id)).then(setRawImplied);
  }, [ownSelected]);

  function addTag(tag: Tag) {
    if (value.includes(tag.id)) return;
    onChange([...value, tag.id]);
  }

  function removeTag(id: string) {
    onChange(value.filter((existingId) => existingId !== id));
  }

  return (
    <div>
      <label className="text-sm font-medium mb-1.5 block">{label}</label>
      {ownSelected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {ownSelected.map((tag) => (
            <span
              key={tag.id}
              className="inline-flex items-center gap-1 pl-3 pr-1.5 py-1 rounded-full bg-card border border-border text-xs"
            >
              {tag.manufacturer && tag.manufacturer !== tag.name ? `${tag.manufacturer} ${tag.name}` : tag.name}
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
      <TagTypeahead
        categoryIds={categoryIds}
        placeholder={`Add ${label.toLowerCase()}…`}
        onSelect={addTag}
        excludeIds={ownSelected.map((t) => t.id)}
      />
      {implied.length > 0 && (
        <p className="text-[11px] text-text-secondary mt-1.5">Also tags: {implied.map((t) => t.name).join(", ")}</p>
      )}
    </div>
  );
}
