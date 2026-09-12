-- FRAME — narrow RPC for marking one of the caller's own notifications read,
-- rather than a column-level UPDATE grant on notifications. Same shape as
-- redeem_invite_code/adjust_video_counter: the client action is real, but it
-- goes through a tightly-scoped function instead of a table-level grant.
create function mark_notification_read(target_id uuid) returns void
language sql
security definer set search_path = public
as $$
  update notifications set read = true
  where id = target_id and recipient_id = auth.uid();
$$;

revoke execute on function mark_notification_read(uuid) from authenticated, anon, public;
grant execute on function mark_notification_read(uuid) to authenticated;
