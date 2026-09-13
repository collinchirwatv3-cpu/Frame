"use client";

import { useState } from "react";
import { NotificationSummary } from "@/components/inbox/NotificationSummary";
import { NotificationList } from "@/components/inbox/NotificationList";
import { DMThreadList } from "@/components/inbox/DMThreadList";
import { useNotifications, type NotificationType } from "@/lib/use-notifications";
import { useCurrentUserStore } from "@/store/current-user-store";

const FILTER_LABELS: Record<NotificationType, string> = {
  like: "Likes",
  comment: "Comments",
  follow: "Followers",
  mention: "Mentions",
  system: "System",
  party_starting: "Frame Parties",
};

/** The durable Notifications destination — one shared useNotifications call
 * feeds both the filter chips and the list below, so there's exactly one
 * fetch and one realtime subscription per visit, not one each. */
export default function InboxPage() {
  const userId = useCurrentUserStore((s) => s.profile?.id ?? null);
  const { rows, status, refresh, markRead, markAllRead } = useNotifications(userId);
  const [filter, setFilter] = useState<NotificationType | null>(null);

  const filteredRows = filter ? rows.filter((r) => r.type === filter) : rows;

  return (
    <div className="pt-8 pb-24 md:pb-8 flex flex-col gap-6">
      <div className="px-6">
        <h1 className="text-2xl font-bold">Inbox</h1>
      </div>
      {status === "ready" && rows.length > 0 && (
        <NotificationSummary rows={rows} activeFilter={filter} onSelectFilter={setFilter} />
      )}
      <NotificationList
        rows={filteredRows}
        status={status}
        hasUnread={rows.some((r) => !r.read)}
        filterLabel={filter ? FILTER_LABELS[filter] : undefined}
        onRetry={refresh}
        onMarkRead={markRead}
        onMarkAllRead={markAllRead}
      />
      <DMThreadList />
    </div>
  );
}
