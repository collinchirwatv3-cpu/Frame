"use client";

import { useCallback, useState } from "react";
import { fetchUnreadThreadCount } from "@/lib/dm";
import { useDMRealtime } from "@/lib/use-dm-realtime";

/**
 * A lightweight count-only query for the Profile Inbox icon's badge — the
 * DM half of it, alongside useUnreadNotificationCount's notifications half
 * (the /inbox route shows both a notifications list and a DM thread list,
 * so the badge needs to reflect either). Shares the same realtime
 * subscription the thread page itself uses (useDMRealtime), so a new
 * message or a read-receipt update anywhere in the caller's threads
 * updates the badge live.
 */
export function useUnreadDMCount(userId: string | null): number {
  const [count, setCount] = useState(0);
  // Same "adjusting state when a prop changes" pattern as
  // useUnreadNotificationCount — without it the badge would keep showing
  // its last-known count forever after sign-out instead of clearing.
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
    setCount(await fetchUnreadThreadCount(userId));
  }, [userId]);

  useDMRealtime(userId, refresh);

  return count;
}
