"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Subscribes to Postgres Changes on `notifications`, scoped to one user via
 * the Realtime channel filter. That filter is a convenience, not the real
 * boundary — notifications_select_own (20260912000000_notifications.sql)
 * is what actually restricts delivery to the recipient, since Postgres
 * Changes evaluates the table's own RLS for the connecting role. Callers
 * refetch their own view of the data on any change rather than this hook
 * trying to keep a full list in sync itself — same "isolated seam" shape as
 * useWatchRoom, just for one table's changefeed instead of broadcast/presence.
 */
export function useNotificationsRealtime(userId: string | null, onChange: () => void) {
  const onChangeRef = useRef(onChange);
  // Written in an effect (not render) so this stays a fresh reference
  // without needing callers to memoize onChange or re-subscribing the
  // channel below every time it changes identity.
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `recipient_id=eq.${userId}` },
        () => onChangeRef.current()
      )
      // Doubles as the initial fetch trigger — callers don't need their own
      // "on mount" effect, this fires once as soon as the subscription is
      // actually live, then again on every future change.
      .subscribe((status) => {
        if (status === "SUBSCRIBED") onChangeRef.current();
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);
}
