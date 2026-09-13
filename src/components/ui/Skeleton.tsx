import { cn } from "@/lib/utils";

/** A single pulsing placeholder block — the shape of the content that will
 * land there, not a generic spinner. Compose a few of these into a
 * layout-stable skeleton for a specific surface (a grid of cards, a shelf
 * row) rather than reaching for a full-page loading spinner. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-xl bg-card", className)} />;
}
