import type { LucideIcon } from "lucide-react";

/** Circular dark icon + centered heading + centered subtext — the pattern
 * every "nothing here yet" screen should use going forward. Introduced for
 * Parties; not retrofitted onto Shorts/Discover's existing plain-text empty
 * states in this pass (out of scope for the nav rebuild itself). */
export function EmptyState({
  icon: Icon,
  heading,
  subtext,
  action,
}: {
  icon: LucideIcon;
  heading: string;
  subtext: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center text-center gap-4 px-6">
      <div className="w-24 h-24 rounded-full bg-card flex items-center justify-center">
        <Icon size={32} className="text-text-secondary" />
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="text-lg font-semibold">{heading}</p>
        <p className="text-sm text-text-secondary max-w-xs">{subtext}</p>
      </div>
      {action}
    </div>
  );
}
