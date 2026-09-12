"use client";

import { useCallback, useState } from "react";
import { AtSign, Bell, Heart, MessageCircle, UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUserStore } from "@/store/current-user-store";
import { useNotificationsRealtime } from "@/lib/use-notifications-realtime";

const TYPES = [
  { id: "like", label: "Likes", icon: Heart },
  { id: "comment", label: "Comments", icon: MessageCircle },
  { id: "follow", label: "Followers", icon: UserPlus },
  { id: "mention", label: "Mentions", icon: AtSign },
  { id: "system", label: "System", icon: Bell },
] as const;

// Real unread counts, grouped client-side (no producer for 'mention' yet —
// see 20260912020000_notification_triggers.sql — so that chip always reads
// 0 for now, same as it always has in the mock data). RLS
// (notifications_select_own) scopes this to the caller's own rows; no
// explicit recipient filter is needed here.
export function NotificationSummary() {
  const userId = useCurrentUserStore((s) => s.profile?.id ?? null);
  const [counts, setCounts] = useState<Partial<Record<(typeof TYPES)[number]["id"], number>>>({});

  const refresh = useCallback(async () => {
    if (!userId) return;
    const supabase = createClient();
    const { data } = await supabase.from("notifications").select("type").eq("read", false);
    const next: Partial<Record<string, number>> = {};
    for (const row of data ?? []) {
      next[row.type] = (next[row.type] ?? 0) + 1;
    }
    setCounts(next);
  }, [userId]);

  // Fetches once as soon as the realtime subscription comes up, then again
  // on every future change — no separate "on mount" effect needed.
  useNotificationsRealtime(userId, refresh);

  if (!userId) return null;

  return (
    <div className="flex gap-3 overflow-x-auto no-scrollbar px-6 pb-1">
      {TYPES.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          className="shrink-0 flex items-center gap-2 bg-card border border-border rounded-full pl-2.5 pr-3.5 py-2"
        >
          <span className="w-7 h-7 rounded-full bg-primary/15 text-primary flex items-center justify-center">
            <Icon size={14} />
          </span>
          <span className="text-sm font-medium">{label}</span>
          {(counts[id] ?? 0) > 0 && <span className="text-xs text-text-secondary">{counts[id]}</span>}
        </button>
      ))}
    </div>
  );
}
