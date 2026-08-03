"use client";

import { cn } from "@/lib/utils";
import { categories } from "@/lib/mock-data";
import type { Category } from "@/lib/types";

export function CategoryChips({
  active,
  onChange,
}: {
  active: Category | "All";
  onChange: (c: Category | "All") => void;
}) {
  const all: (Category | "All")[] = ["All", ...categories];

  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar px-6 pb-1">
      {all.map((c) => (
        <button
          key={c}
          onClick={() => onChange(c)}
          className={cn(
            "shrink-0 px-4 py-1.5 rounded-full text-sm font-medium border transition-colors",
            active === c
              ? "bg-primary text-bg border-primary"
              : "border-border text-text-secondary hover:text-accent hover:border-accent/40"
          )}
        >
          {c}
        </button>
      ))}
    </div>
  );
}
