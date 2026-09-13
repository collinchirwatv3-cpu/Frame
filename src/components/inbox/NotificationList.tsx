"use client";

import Link from "next/link";
import { AtSign, Bell, CheckCheck, Heart, MessageCircle, PartyPopper, UserPlus } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { cn, formatRelativeTime } from "@/lib/utils";
import type { NotificationRow, NotificationsStatus, NotificationType } from "@/lib/use-notifications";

const ICONS: Record<NotificationType, typeof Heart> = {
  like: Heart,
  comment: MessageCircle,
  follow: UserPlus,
  mention: AtSign,
  system: Bell,
  party_starting: PartyPopper,
};

function describe(row: NotificationRow): string {
  const name = row.actor?.display_name ?? "Someone";
  switch (row.type) {
    case "like":
      return `${name} liked your Frame`;
    case "comment":
      return `${name} commented on your Frame`;
    case "follow":
      return `${name} followed you`;
    case "mention":
      return `${name} mentioned you`;
    case "system":
      return "News from FRAMES";
    case "party_starting":
      return `${name}'s Frame Party is starting`;
  }
}

function hrefFor(row: NotificationRow): string {
  if (row.type === "follow" && row.actor) return `/profile/${row.actor.username}`;
  if (row.type === "party_starting" && row.party) {
    return row.party.video_id ? `/watch-together/${row.party.id}?v=${row.party.video_id}` : `/watch-together/${row.party.id}`;
  }
  if (row.video_id) return `/watch/${row.video_id}`;
  return "/inbox";
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Today / Earlier this week / Earlier — a natural, low-effort grouping
 * (no pagination, just three buckets over the same bounded fetch) rather
 * than per-day headings, which would be noisy for how infrequently these
 * actually fire. Rows arrive newest-first already; order within each
 * bucket is preserved. */
function groupByTime(rows: NotificationRow[]): { label: string; rows: NotificationRow[] }[] {
  const todayStart = startOfDay(new Date());
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 7);

  const today: NotificationRow[] = [];
  const thisWeek: NotificationRow[] = [];
  const earlier: NotificationRow[] = [];

  for (const row of rows) {
    const created = new Date(row.created_at);
    if (created >= todayStart) today.push(row);
    else if (created >= weekStart) thisWeek.push(row);
    else earlier.push(row);
  }

  return [
    { label: "Today", rows: today },
    { label: "Earlier this week", rows: thisWeek },
    { label: "Earlier", rows: earlier },
  ].filter((g) => g.rows.length > 0);
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-1 px-6">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3 py-3">
          <Skeleton className="w-11 h-11 rounded-full shrink-0" />
          <div className="flex-1 flex flex-col gap-1.5">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-2.5 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** The real Inbox notification feed. Purely presentational — data, status,
 * and the read-state mutations all live in useNotifications, shared with
 * NotificationSummary's filter chips so the two never fetch or subscribe
 * independently. */
export function NotificationList({
  rows,
  status,
  hasUnread,
  filterLabel,
  onRetry,
  onMarkRead,
  onMarkAllRead,
}: {
  rows: NotificationRow[];
  status: NotificationsStatus;
  hasUnread: boolean;
  /** Set when NotificationSummary's chip filter is active — swaps the
   * empty-state copy so an active filter with zero matches doesn't read as
   * "you have no notifications at all." */
  filterLabel?: string;
  onRetry: () => void;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
}) {
  if (status === "loading") return <ListSkeleton />;

  if (status === "error") {
    return (
      <div className="flex items-center justify-center py-12">
        <ErrorState onRetry={onRetry} heading="Couldn't load notifications" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 text-center py-16 px-6">
        <span className="w-12 h-12 rounded-full bg-card border border-border flex items-center justify-center">
          <Bell size={20} className="text-text-secondary" />
        </span>
        <p className="text-sm font-medium">
          {filterLabel ? `No ${filterLabel} notifications yet` : "No notifications yet"}
        </p>
        <p className="text-xs text-text-secondary max-w-[220px]">
          {filterLabel
            ? "Try a different category, or check back later."
            : "Likes, comments, new followers, and Frame Party alerts will show up here."}
        </p>
      </div>
    );
  }

  const groups = groupByTime(rows);

  return (
    <div className="flex flex-col">
      {hasUnread && (
        <div className="flex justify-end px-6 pb-2">
          <button
            onClick={onMarkAllRead}
            className="flex items-center gap-1.5 text-xs font-medium text-text-secondary hover:text-accent transition-colors"
          >
            <CheckCheck size={13} />
            Mark all as read
          </button>
        </div>
      )}
      {groups.map((group) => (
        <div key={group.label} className="flex flex-col">
          <h2 className="px-6 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
            {group.label}
          </h2>
          {group.rows.map((row) => {
            const Icon = ICONS[row.type];
            return (
              <Link
                key={row.id}
                href={hrefFor(row)}
                onClick={() => {
                  if (!row.read) onMarkRead(row.id);
                }}
                className="flex items-center gap-3 px-6 py-3 hover:bg-card/60 transition-colors"
              >
                {row.actor ? (
                  <Avatar src={row.actor.avatar_url ?? ""} alt={row.actor.display_name} size={44} />
                ) : (
                  <span className="w-11 h-11 rounded-full bg-card border border-border flex items-center justify-center shrink-0">
                    <Icon size={18} className="text-primary" />
                  </span>
                )}
                <div className="flex-1 min-w-0">
                  <p className={cn("text-sm truncate", !row.read && "font-medium")}>{describe(row)}</p>
                  <p className="text-xs text-text-secondary mt-0.5">{formatRelativeTime(row.created_at)}</p>
                </div>
                {!row.read && <span className="w-2 h-2 rounded-full bg-primary shrink-0" aria-label="Unread" />}
              </Link>
            );
          })}
        </div>
      ))}
    </div>
  );
}
