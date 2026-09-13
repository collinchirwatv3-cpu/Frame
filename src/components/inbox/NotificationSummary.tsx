"use client";

import { Heart, MessageCircle, PartyPopper, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NotificationRow, NotificationType } from "@/lib/use-notifications";

// Mentions/System dropped from this row entirely — neither has a real
// producer (no @mention parsing exists, and nothing ever inserts a
// 'system' notification yet), so a permanent "0" chip for either was
// exactly the "looks tappable, represents nothing real" clutter this pass
// is supposed to remove, not preserve.
const TYPES: { id: NotificationType; label: string; icon: typeof Heart }[] = [
  { id: "like", label: "Likes", icon: Heart },
  { id: "comment", label: "Comments", icon: MessageCircle },
  { id: "follow", label: "Followers", icon: UserPlus },
  { id: "party_starting", label: "Frame Parties", icon: PartyPopper },
];

/** Real filter chips now, not inert buttons — tapping one scopes
 * NotificationList to that type, tapping the active one again clears the
 * filter. Counts (unread, out of the same bounded fetch NotificationList
 * renders — no separate query) are a restrained summary, not a badge-heavy
 * treatment: they only show once positive. */
export function NotificationSummary({
  rows,
  activeFilter,
  onSelectFilter,
}: {
  rows: NotificationRow[];
  activeFilter: NotificationType | null;
  onSelectFilter: (type: NotificationType | null) => void;
}) {
  return (
    <div className="flex gap-3 overflow-x-auto no-scrollbar px-6 pb-1">
      {TYPES.map(({ id, label, icon: Icon }) => {
        const unreadCount = rows.filter((r) => r.type === id && !r.read).length;
        const active = activeFilter === id;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={active}
            onClick={() => onSelectFilter(active ? null : id)}
            className={cn(
              "shrink-0 flex items-center gap-2 rounded-full pl-2.5 pr-3.5 py-2 border transition-colors",
              active ? "bg-primary/10 border-primary" : "bg-card border-border"
            )}
          >
            <span
              className={cn(
                "w-7 h-7 rounded-full flex items-center justify-center",
                active ? "bg-primary/25 text-primary" : "bg-primary/15 text-primary"
              )}
            >
              <Icon size={14} />
            </span>
            <span className="text-sm font-medium">{label}</span>
            {unreadCount > 0 && <span className="text-xs text-text-secondary">{unreadCount}</span>}
          </button>
        );
      })}
    </div>
  );
}
