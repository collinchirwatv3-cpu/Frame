"use client";

import { useEffect, useState } from "react";
import { fetchTagsByCategory } from "@/lib/tags-fetch";
import type { Tag } from "@/lib/types";

/** Single-select, replaces the old plain-<select>-over-a-hardcoded-array
 * category picker — same UX (~35 options fits a native select fine, no
 * typeahead needed the way gear's hundreds of models do), backed by real
 * content_type tags instead. */
export function ContentTypeSelect({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (tagId: string) => void;
}) {
  const [options, setOptions] = useState<Tag[]>([]);

  useEffect(() => {
    fetchTagsByCategory("content_type").then(setOptions);
  }, []);

  return (
    <select
      required
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-card border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary transition-colors"
    >
      <option value="" disabled>
        Choose a content type
      </option>
      {options.map((tag) => (
        <option key={tag.id} value={tag.id}>
          {tag.name}
        </option>
      ))}
    </select>
  );
}
