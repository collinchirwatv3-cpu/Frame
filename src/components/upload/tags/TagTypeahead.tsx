"use client";

import { useEffect, useState } from "react";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { searchTags } from "@/lib/tags-fetch";
import type { Tag } from "@/lib/types";

/** The shared search-as-you-type primitive — the actual mechanism behind
 * "creators should never need to manually type a tag if it already
 * exists." Every picker (genre/topic/mood/location/gear) is this field
 * plus category-specific framing around it. */
export function TagTypeahead({
  categoryIds,
  placeholder = "Search…",
  onSelect,
  excludeIds = [],
}: {
  categoryIds: string[];
  placeholder?: string;
  onSelect: (tag: Tag) => void;
  excludeIds?: string[];
}) {
  const [query, setQuery] = useState("");
  const [rawResults, setRawResults] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(false);
  const debouncedQuery = useDebouncedValue(query, 200);
  // Derived, not reset via a synchronous setState in the effect below — an
  // empty query means "no results" instantly, without waiting on (or
  // triggering) the effect at all.
  const results = debouncedQuery.trim() ? rawResults : [];

  useEffect(() => {
    if (!debouncedQuery.trim()) return;
    let cancelled = false;
    setLoading(true);
    searchTags(debouncedQuery, categoryIds).then((tags) => {
      if (cancelled) return;
      setRawResults(tags.filter((t) => !excludeIds.includes(t.id)));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // excludeIds intentionally excluded — it's an array literal recreated
    // on every parent render, and re-searching whenever it changes value
    // (not identity) would refire on every keystroke of an unrelated
    // field; results are filtered against it directly above regardless.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery, categoryIds]);

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-card border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary transition-colors"
      />
      {query.trim().length > 0 && (
        <div className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto rounded-xl border border-border bg-card shadow-lg">
          {loading && <div className="px-4 py-2.5 text-xs text-text-secondary">Searching…</div>}
          {!loading && results.length === 0 && (
            <div className="px-4 py-2.5 text-xs text-text-secondary">No matches</div>
          )}
          {!loading &&
            results.map((tag) => (
              <button
                key={tag.id}
                type="button"
                onClick={() => {
                  onSelect(tag);
                  setQuery("");
                  setRawResults([]);
                }}
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-bg transition-colors flex items-center justify-between gap-2"
              >
                <span className="truncate">{tag.name}</span>
                {tag.manufacturer && tag.manufacturer !== tag.name && (
                  <span className="text-xs text-text-secondary shrink-0">{tag.manufacturer}</span>
                )}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
