"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useNotificationsRealtime } from "@/lib/use-notifications-realtime";

export type NotificationType = "like" | "comment" | "follow" | "mention" | "system" | "party_starting";

export type NotificationRow = {
  id: string;
  type: NotificationType;
  read: boolean;
  created_at: string;
  video_id: string | null;
  actor: { username: string; display_name: string; avatar_url: string | null } | null;
  party: { id: string; video_id: string | null } | null;
};

const SELECT =
  "id, type, read, created_at, video_id, actor:profiles!notifications_actor_id_fkey(username, display_name, avatar_url), party:watch_parties!notifications_party_id_fkey(id, video_id)";

// Bounded, not paginated — "a concise activity record, not an engagement
// machine" doesn't need infinite scroll; 50 is generous for how
// infrequently these actually fire (likes/comments/follows/party alerts
// only, nothing per-save or per-queue-action).
const FETCH_LIMIT = 50;

export type NotificationsStatus = "loading" | "error" | "ready";

/**
 * The single data source for the Inbox: one bounded fetch, one realtime
 * subscription (useNotificationsRealtime), shared by NotificationSummary's
 * filter chips and NotificationList's grouped list — previously each of
 * those fetched and subscribed independently, doubling both for no reason.
 * Read-state mutations are optimistic with rollback on failure, per the
 * brief's explicit requirement (a failed mark_notification_read/
 * mark_all_notifications_read RPC call must not leave the UI silently
 * lying about what's actually read server-side).
 */
export function useNotifications(userId: string | null) {
  const [rows, setRows] = useState<NotificationRow[]>([]);
  // Initial value must already account for a null userId — the render-time
  // adjustment below only fires on a later CHANGE (trackedUserId starts
  // equal to userId by construction, so it can't also cover the first
  // render).
  const [status, setStatus] = useState<NotificationsStatus>(userId ? "loading" : "ready");
  // React's own "adjusting state when a prop changes" pattern
  // (react.dev/learn/you-might-not-need-an-effect) — a plain conditional in
  // the render body, not an effect, so a sign-out (userId -> null) resets
  // rows/status in the SAME render rather than committing a stale frame
  // first. useNotificationsRealtime never calls back for a null userId (it
  // returns before subscribing), so without this, status would stay
  // "loading" forever instead of resolving to an empty, ready Inbox.
  const [trackedUserId, setTrackedUserId] = useState(userId);
  if (userId !== trackedUserId) {
    setTrackedUserId(userId);
    setRows([]);
    setStatus(userId ? "loading" : "ready");
  }
  // Read synchronously inside markRead/markAllRead for the rollback value —
  // a setState functional-updater callback isn't reliably synchronous
  // enough for that (it runs when React processes the update, not
  // necessarily before the very next line), so capturing "previous" that
  // way raced the RPC call itself. A ref updated every render sidesteps
  // that entirely.
  const rowsRef = useRef(rows);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const refresh = useCallback(async () => {
    if (!userId) {
      setRows([]);
      setStatus("ready");
      return;
    }
    const supabase = createClient();
    const { data, error } = await supabase
      .from("notifications")
      .select(SELECT)
      .order("created_at", { ascending: false })
      .limit(FETCH_LIMIT);
    if (error) {
      setStatus("error");
      return;
    }
    setRows((data as unknown as NotificationRow[] | null) ?? []);
    setStatus("ready");
  }, [userId]);

  // Fetches once as soon as the realtime subscription comes up, then again
  // on every future change — no separate "on mount" effect needed for a
  // signed-in user (the null-userId case is handled above, during render).
  useNotificationsRealtime(userId, refresh);

  const markRead = useCallback(async (id: string) => {
    const previous = rowsRef.current;
    setRows(previous.map((r) => (r.id === id ? { ...r, read: true } : r)));
    const supabase = createClient();
    const { error } = await supabase.rpc("mark_notification_read", { target_id: id });
    if (error) setRows(previous);
  }, []);

  const markAllRead = useCallback(async () => {
    const previous = rowsRef.current;
    setRows(previous.map((r) => ({ ...r, read: true })));
    const supabase = createClient();
    const { error } = await supabase.rpc("mark_all_notifications_read");
    if (error) setRows(previous);
  }, []);

  return { rows, status, refresh, markRead, markAllRead };
}
