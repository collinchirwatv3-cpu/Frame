-- FRAME — narrow RPC for "Mark all as read," same shape as
-- mark_notification_read (20260912030000): a security-definer function
-- scoped to the caller's own rows via recipient_id = auth.uid(), not a
-- table-level UPDATE grant on notifications.
create function mark_all_notifications_read() returns void
language sql
security definer set search_path = public
as $$
  update notifications set read = true
  where recipient_id = auth.uid() and read = false;
$$;

revoke execute on function mark_all_notifications_read() from authenticated, anon, public;
grant execute on function mark_all_notifications_read() to authenticated;
