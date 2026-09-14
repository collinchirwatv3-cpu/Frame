-- FRAME — DM review fixes, layered on top of 20260917000000_direct_messages.sql
-- (already applied remotely, so this is a new migration rather than an edit
-- to that file).

-- 1. Realtime read-receipt feedback loop: mark_dm_thread_read unconditionally
-- UPDATEd both read columns every call, which fires its own dm_threads
-- change event, which the caller's own realtime subscription (useDMRealtime)
-- picks back up and re-triggers a refresh -> another mark-read call -> loop.
-- Postgres logical replication fires a change event for any row an UPDATE
-- statement actually touches, even if the SET values are unchanged — a
-- "no-op" UPDATE (same values) still isn't a no-op for replication. The
-- real fix is to only WRITE when there is genuinely something new to mark
-- read, so an already-read thread's refresh performs no write at all and
-- emits no event. (Paired with a client-side check in dm.ts/[threadId]/page.tsx
-- that also skips calling this when the fetched thread is already read —
-- belt and suspenders, since either alone bounds the loop to at most one
-- extra round-trip per genuine read transition.)
create or replace function mark_dm_thread_read(target_thread_id uuid) returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  update dm_threads
  set user_a_last_read_at = case when user_a_id = v_me then now() else user_a_last_read_at end,
      user_b_last_read_at = case when user_b_id = v_me then now() else user_b_last_read_at end
  where id = target_thread_id
    and (user_a_id = v_me or user_b_id = v_me)
    and last_message_at is not null
    and (
      (user_a_id = v_me and (user_a_last_read_at is null or user_a_last_read_at < last_message_at))
      or
      (user_b_id = v_me and (user_b_last_read_at is null or user_b_last_read_at < last_message_at))
    );
end;
$$;

-- 2. Concurrent thread creation: the old select-then-insert was a genuine
-- check-then-act race — two simultaneous callers (e.g. both participants
-- tapping "Message" on each other at once) could both pass the SELECT
-- before either COMMITs, and the second INSERT would fail outright on the
-- (user_a_id, user_b_id) unique constraint instead of returning the
-- existing thread. Replaced with a single atomic INSERT ... ON CONFLICT,
-- which Postgres serializes at the unique index itself — concurrent callers
-- can never both "win," and both branches (fresh insert vs. conflict-into-
-- update) return the same row's id via RETURNING. The `do update set
-- user_a_id = excluded.user_a_id` is a no-op write (the conflict only
-- happens when user_a_id already equals excluded.user_a_id) — it exists
-- solely because `on conflict do nothing` can't RETURNING an existing row.
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

-- 3. Rate-limit bypass: dm_messages_insert_own's RLS check (participant +
-- invited + not blocked) was always the real authorization boundary, but
-- nothing stopped an authenticated participant from calling
-- supabase.from("dm_messages").insert(...) directly with the anon key,
-- skipping /api/dm/messages and its rate limiter entirely — REST, realtime
-- broadcast-from-client, and any future code path all share the same RLS,
-- so the app-level limiter was never actually unavoidable. A BEFORE INSERT
-- trigger closes this for real: it runs inside Postgres for every insert
-- regardless of which client path performed it, so it can't be routed
-- around the way an application-layer check can. Same 30-per-minute budget
-- as dmMessageRateLimiter (rate-limit.ts) for consistency — this is the
-- backstop that can't be bypassed, not a replacement for the app-level
-- limiter's nicer Retry-After response on the normal path.
create function enforce_dm_rate_limit() returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_recent_count integer;
begin
  select count(*) into v_recent_count
  from dm_messages
  where sender_id = new.sender_id
    and created_at > now() - interval '1 minute';
  if v_recent_count >= 30 then
    raise exception 'Too many messages sent recently. Please slow down.';
  end if;
  return new;
end;
$$;

create trigger dm_messages_rate_limit
  before insert on dm_messages
  for each row execute function enforce_dm_rate_limit();
