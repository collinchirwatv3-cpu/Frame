"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { AtSign, Bell, Heart, MessageCircle, UserPlus } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUserStore } from "@/store/current-user-store";
import { useNotificationsRealtime } from "@/lib/use-notifications-realtime";
import { cn, formatRelativeTime } from "@/lib/utils";

type NotificationType = "like" | "comment" | "follow" | "mention" | "system";

type NotificationRow = {
  id: string;
  type: NotificationType;
  read: boolean;
  created_at: string;
  video_id: string | null;
  actor: { username: string; display_name: string; avatar_url: string | null } | null;
};

const ICONS: Record<NotificationType, typeof Heart> = {
  like: Heart,
  comment: MessageCircle,
  follow: UserPlus,
  mention: AtSign,
  system: Bell,
};

function describe(row: NotificationRow): string {
  const name = row.actor?.display_name ?? "Someone";
  switch (row.type) {
    case "like":
      return `${name} liked your video`;
    case "comment":
      return `${name} commented on your video`;
    case "follow":
      return `${name} followed you`;
    case "mention":
      return `${name} mentioned you`;
    case "system":
      return "News from FRAMES";
  }
}

function hrefFor(row: NotificationRow): string {
  if (row.type === "follow" && row.actor) return `/profile/${row.actor.username}`;
  if (row.video_id) return `/watch/${row.video_id}`;
  return "/inbox";
}

/** The real Inbox notification feed — replaces the mock DM thread list.
 * Real-time updates come from useNotificationsRealtime, which just tells
 * this component to refetch rather than trying to patch individual rows. */
export function NotificationList() {
  const userId = useCurrentUserStore((s) => s.profile?.id ?? null);
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    const supabase = createClient();
    const { data } = await supabase
      .from("notifications")
      .select(
        "id, type, read, created_at, video_id, actor:profiles!notifications_actor_id_fkey(username, display_name, avatar_url)"
      )
      .order("created_at", { ascending: false })
      .limit(50);
    setRows((data as unknown as NotificationRow[] | null) ?? []);
    setLoading(false);
  }, [userId]);

  // Fetches once as soon as the realtime subscription comes up, then again
  // on every future change — no separate "on mount" effect needed.
  useNotificationsRealtime(userId, refresh);

  function handleOpen(row: NotificationRow) {
    if (row.read) return;
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, read: true } : r)));
    createClient()
      .rpc("mark_notification_read", { target_id: row.id })
      .then(() => {});
  }

  if (!userId || loading) return null;

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 text-center py-16 px-6">
        <span className="w-12 h-12 rounded-full bg-card border border-border flex items-center justify-center">
          <Bell size={20} className="text-text-secondary" />
        </span>
        <p className="text-sm font-medium">No notifications yet</p>
        <p className="text-xs text-text-secondary max-w-[220px]">
          Likes, comments, and new followers will show up here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {rows.map((row) => {
        const Icon = ICONS[row.type];
        return (
          <Link
            key={row.id}
            href={hrefFor(row)}
            onClick={() => handleOpen(row)}
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
            {!row.read && <span className="w-2 h-2 rounded-full bg-primary shrink-0" />}
          </Link>
        );
      })}
    </div>
  );
}
