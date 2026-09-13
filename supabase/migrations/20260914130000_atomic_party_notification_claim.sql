-- FRAME — release-blocker fix. The old notify-scheduled route did its
-- candidate-select, isDue() check, follower-notify, and last_notified_at
-- update as separate client-side round trips with no locking at all — two
-- overlapping cron invocations (a retry, an overlapping schedule, a manual
-- re-trigger) could both read the same party as "due" before either had
-- written last_notified_at, and both would fan out notifications to every
-- follower. Worse, the old route never checked the notifications insert's
-- error at all, and set last_notified_at unconditionally regardless of
-- whether the follower lookup or the insert actually succeeded — a
-- transient failure would silently mark a party "notified" that never
-- actually notified anyone, with no retry.
--
-- This function claims and processes due parties in one atomic pass:
-- `for update skip locked` means a second concurrent call skips any row the
-- first call is still holding, so two overlapping invocations can never
-- both process the same party. Each party is handled in its own nested
-- block so one party's failure doesn't abort the whole batch, and
-- last_notified_at is only set AFTER the notification insert actually
-- succeeds (an exception before that point leaves last_notified_at
-- untouched, so the party is correctly retried on the next run) —
-- replacing the caller's separate un-checked round trips with a single
-- statement that fails atomically per party.
--
-- security definer + explicit revoke: this must run with the privileges to
-- write last_notified_at (client roles never get that column, per
-- 20260914040000_lock_down_watch_parties_update.sql) but must never be
-- callable by anything other than the cron route's service-role key, which
-- bypasses grants entirely — so authenticated/anon/public gain nothing by
-- having execute and lose nothing by not.
create or replace function claim_and_notify_due_parties()
returns table (party_id uuid, notified_count integer, outcome text)
language plpgsql
security definer set search_path = public
as $$
declare
  v_party record;
  v_recipient_count integer;
begin
  for v_party in
    select id, host_id, repeat_rule, last_notified_at
    from watch_parties
    where scheduled_at is not null
      and scheduled_at <= now()
    for update skip locked
  loop
    -- Mirrors isDue() in src/app/api/internal/parties/notify-scheduled/route.ts
    -- exactly — keep both in sync if this logic ever changes.
    if not (
      v_party.last_notified_at is null
      or (v_party.repeat_rule = 'daily' and now() - v_party.last_notified_at >= interval '1 day')
      or (v_party.repeat_rule = 'weekly' and now() - v_party.last_notified_at >= interval '7 days')
    ) then
      continue;
    end if;

    begin
      insert into notifications (recipient_id, actor_id, type, party_id)
      select follower_id, v_party.host_id, 'party_starting', v_party.id
      from follows
      where followee_id = v_party.host_id;
      get diagnostics v_recipient_count = row_count;

      update watch_parties set last_notified_at = now() where id = v_party.id;

      party_id := v_party.id;
      notified_count := v_recipient_count;
      outcome := 'notified';
      return next;
    exception when others then
      -- Caught per-party (an implicit savepoint around this block) so one
      -- party's failure doesn't roll back or abort parties already
      -- processed earlier in this same call. last_notified_at is left
      -- untouched, so this party is retried on the next invocation.
      party_id := v_party.id;
      notified_count := 0;
      outcome := 'failed: ' || sqlerrm;
      return next;
    end;
  end loop;
end;
$$;

revoke execute on function claim_and_notify_due_parties() from authenticated, anon, public;
