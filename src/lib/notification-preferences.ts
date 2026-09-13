import { createClient } from "@/lib/supabase/client";

/** Only the three categories with a real, shipping producer get a toggle —
 * see 20260916000000_notification_preferences.sql's own comment for why
 * likes (no toggle, always on) and new-Frames-from-followed-creators (no
 * producer at all) aren't here. */
export type NotificationPreferences = {
  partyStarting: boolean;
  comments: boolean;
  follows: boolean;
};

const DEFAULTS: NotificationPreferences = { partyStarting: true, comments: true, follows: true };

/** No row yet means "all defaults" — same convention the enforcement
 * triggers use server-side (coalesce(..., true)), so a user who never
 * visits Settings gets the exact behavior they'd expect without a
 * backfilled row. */
export async function fetchNotificationPreferences(userId: string): Promise<NotificationPreferences> {
  const supabase = createClient();
  const { data } = await supabase
    .from("notification_preferences")
    .select("party_starting, comments, follows")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return DEFAULTS;
  return { partyStarting: data.party_starting, comments: data.comments, follows: data.follows };
}

/** Always upserts the full row (not a partial patch) — simplest way to
 * avoid relying on PostgREST's column-level upsert-merge semantics for
 * something this low-stakes; the caller already has the full current
 * preferences object in state before flipping one field. */
export async function saveNotificationPreferences(
  userId: string,
  preferences: NotificationPreferences
): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase.from("notification_preferences").upsert({
    user_id: userId,
    party_starting: preferences.partyStarting,
    comments: preferences.comments,
    follows: preferences.follows,
    updated_at: new Date().toISOString(),
  });
  return !error;
}
