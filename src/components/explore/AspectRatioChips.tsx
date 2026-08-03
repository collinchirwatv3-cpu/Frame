"use client";

import { cn } from "@/lib/utils";
import { SUPPORTED_ASPECT_RATIOS, type AspectRatioId } from "@/lib/aspect-ratio";

export function AspectRatioChips({
  active,
  onChange,
}: {
  active: AspectRatioId | "All";
  onChange: (id: AspectRatioId | "All") => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar px-6 pb-1">
      <button
        onClick={() => onChange("All")}
        className={cn(
          "shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium border transition-colors",
          active === "All"
            ? "bg-accent text-bg border-accent"
            : "border-border text-text-secondary hover:text-accent hover:border-accent/40"
        )}
      >
        All ratios
      </button>
      {SUPPORTED_ASPECT_RATIOS.map((ratio) => (
        <button
          key={ratio.id}
          onClick={() => onChange(ratio.id)}
          className={cn(
            "shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium border transition-colors",
            active === ratio.id
              ? "bg-accent text-bg border-accent"
              : "border-border text-text-secondary hover:text-accent hover:border-accent/40"
          )}
        >
          {ratio.filterLabel}
        </button>
      ))}
    </div>
  );
}
