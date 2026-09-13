import { AlertCircle, type LucideIcon } from "lucide-react";

/** Same shape as EmptyState (circular icon + heading + subtext), for the
 * "this failed to load" case specifically — never shows the raw Supabase/
 * network error, just a generic message plus a Retry action. Compact by
 * design: this fills the same slot content or an empty state would have,
 * not a full-page takeover. */
export function ErrorState({
  onRetry,
  heading = "Couldn't load this",
  subtext = "Check your connection and try again.",
  icon: Icon = AlertCircle,
}: {
  onRetry: () => void;
  heading?: string;
  subtext?: string;
  icon?: LucideIcon;
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
      <button
        onClick={onRetry}
        className="px-5 py-2.5 rounded-full bg-primary text-bg text-sm font-semibold"
      >
        Retry
      </button>
    </div>
  );
}
