"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Subscribes to Postgres Changes on both dm_threads and dm_messages, scoped
 * to one user — same shape as useNotificationsRealtime, just two tables on
 * one channel instead of one. No column filter is possible here (unlike
 * notifications' recipient_id=eq.userId convenience filter): "threads this
 * user is part of" isn't a single-column equality, so this relies entirely
 * on dm_threads_select_own/dm_messages_select_own's RLS to scope delivery,
 * same as notifications really does underneath its filter anyway.
 */
export function useDMRealtime(userId: string | null, onChange: () => void) {
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`dm:${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "dm_threads" }, () => onChangeRef.current())
      .on("postgres_changes", { event: "*", schema: "public", table: "dm_messages" }, () => onChangeRef.current())
      .subscribe((status) => {
        if (status === "SUBSCRIBED") onChangeRef.current();
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);
}
