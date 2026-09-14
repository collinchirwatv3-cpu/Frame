-- FRAME — recovers two fixes from 20260917010000_dm_fixes.sql that turned
-- out to have never actually been applied to this project, discovered via
-- live verification of this round's work: pg_trigger showed no
-- dm_messages_rate_limit trigger at all, and pg_get_functiondef showed
-- get_or_create_dm_thread was still migration 0's original select-then-
-- insert body. 20260917020000_dm_fixes_2.sql's `create or replace function
-- enforce_dm_rate_limit()` silently succeeded either way (create-or-replace
-- doesn't require a prior version to exist), which is why this went
-- unnoticed until a live concurrency check actually exercised it — the
-- function existed and was correct, but nothing on dm_messages ever called
-- it, so a real sender could send unlimited messages with no backstop.
--
-- 20260917010000_dm_fixes.sql's third fix (the old single-arg
-- mark_dm_thread_read's already-read no-op guard) is NOT re-applied here —
-- 20260917030000_dm_fixes_3.sql already fully replaced that function with
-- the three-arg, database-validated version (confirmed live), so there is
-- nothing left of the old fix to recover.

-- 1. The rate-limit trigger itself. enforce_dm_rate_limit() (as redefined
-- by 20260917020000_dm_fixes_2.sql, confirmed live and correct — the
-- FOR UPDATE row-lock version) was simply never wired up to fire.
drop trigger if exists dm_messages_rate_limit on dm_messages;
create trigger dm_messages_rate_limit
  before insert on dm_messages
  for each row execute function enforce_dm_rate_limit();

-- 2. Concurrent thread creation: restore the atomic INSERT ... ON CONFLICT
-- upsert (see 20260917010000_dm_fixes.sql's own comment for the race this
-- closes) in place of the racy select-then-insert still live today.
create or replace function get_or_create_dm_thread(other_user_id uuid) returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_a uuid;
  v_b uuid;
  v_thread_id uuid;
begin
  if v_me is null then
    raise exception 'Not authenticated';
  end if;
  if other_user_id = v_me then
    raise exception 'Cannot start a thread with yourself';
  end if;
  if not is_invited(v_me) then
    raise exception 'An invite is required';
  end if;
  if is_blocked_pair(v_me, other_user_id) then
    raise exception 'Cannot message this user';
  end if;

  if v_me < other_user_id then
    v_a := v_me;
    v_b := other_user_id;
  else
    v_a := other_user_id;
    v_b := v_me;
  end if;

  insert into dm_threads (user_a_id, user_b_id)
  values (v_a, v_b)
  on conflict (user_a_id, user_b_id) do update set user_a_id = excluded.user_a_id
  returning id into v_thread_id;

  return v_thread_id;
end;
$$;
