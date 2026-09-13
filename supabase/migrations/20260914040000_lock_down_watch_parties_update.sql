-- FRAME — CRITICAL FIX. watch_parties never had its default blanket UPDATE
-- grant revoked, and watch_parties_update_own ("for update using (auth.uid()
-- = host_id)") has no column scoping — so a host can freely rewrite
-- last_notified_at back to null via a direct PATCH, re-triggering the
-- notify-scheduled cron's isDue() check (which treats null as "always due")
-- and spamming every follower on demand. Confirmed live: an RLS-scoped
-- client did exactly this with no error. host_id and last_notified_at must
-- never be client-writable; scheduled_at/repeat_rule/visibility/title/
-- video_id are legitimate host edits.
revoke update on table watch_parties from authenticated, anon, public;
grant update (title, video_id, visibility, scheduled_at, repeat_rule) on watch_parties to authenticated;
