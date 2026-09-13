"use client";

import { useCallback, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useNotificationsRealtime } from "@/lib/use-notifications-realtime";

/**
 * A lightweight count-only query for the Profile Inbox icon's badge — deliberately
 * separate from useNotifications' full row fetch (ProfileHeader shouldn't pull
 * 50 full notification rows with actor/party embeds just to know whether to
 * show a dot). Shares the same realtime subscription mechanism, just a
 * different query behind it.
 */
export function useUnreadNotificationCount(userId: string | null): number {
  const [count, setCount] = useState(0);
  // React's own "adjusting state when a prop changes" pattern — a plain
  // conditional in the render body, not an effect. useNotificationsRealtime
  // never calls back for a null userId (it returns before subscribing), so
  // without this, the badge would keep showing its last-known count forever
  // after sign-out instead of clearing.
  const [trackedUserId, setTrackedUserId] = useState(userId);
  if (userId !== trackedUserId) {
    setTrackedUserId(userId);
    setCount(0);
  }

  const refresh = useCallback(async () => {
    if (!userId) {
      setCount(0);
      return;
    }
    const supabase = createClient();
    const { count: unread } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("read", false);
    setCount(unread ?? 0);
  }, [userId]);

  useNotificationsRealtime(userId, refresh);

  return count;
}
