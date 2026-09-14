-- FRAME — second round of DM review fixes, layered on top of
-- 20260917000000_direct_messages.sql and 20260917010000_dm_fixes.sql (both
-- already applied remotely — this is a new migration, not an edit to
-- either).

-- 1. Untrusted timestamps. dm_messages_insert_own never constrained which
-- COLUMNS a direct insert could set — only insert() ever revoked
-- update/delete, never restricted which columns insert itself could
-- supply. A caller could set created_at directly: backdating it excludes
-- the row from enforce_dm_rate_limit's `created_at > now() - interval
-- '1 minute'` count forever, defeating the rate limit outright; a
-- future-dated row becomes dm_threads.last_message_at (via the touch
-- trigger), and since no real now() can ever exceed a fabricated future
-- timestamp, mark_dm_thread_read's "is there something new" condition
-- would never resolve false again — permanently unread, and reviving the
-- exact realtime feedback loop 20260917010000 fixed (its conditional
-- UPDATE would always find something to write, always emit a change
-- event, always re-trigger a refresh).
--
-- Fixed the same way 20260914060000_harden_clips_insert.sql already
-- fixed the identical class of problem for clips: a column-scoped GRANT.
-- Postgres enforces column privileges independently of RLS — an insert
-- naming a column outside the grant is rejected outright, before
-- dm_messages_insert_own's `with check` (or any trigger) even runs, so
-- created_at (and id, same reasoning) can only ever take its own DEFAULT.
revoke insert on table dm_messages from authenticated, anon, public;
grant insert (thread_id, sender_id, text) on dm_messages to authenticated;

-- 2. Concurrent rate-limit bypass. enforce_dm_rate_limit's SELECT COUNT(*)
-- then INSERT was itself a check-then-act race: under READ COMMITTED
-- (Postgres' default), N simultaneous inserts from the same sender each
-- run their own COUNT(*) against a snapshot that doesn't yet see the
-- others' uncommitted rows, so all N can see "29 sent, still under 30"
-- and all N commit — the limit only ever bound a single insert at a time,
-- not real concurrent traffic.
--
-- Replaced with a dedicated per-sender counter row, serialized with
-- SELECT ... FOR UPDATE: the first concurrent transaction to reach this
-- point locks that sender's row for the rest of its own transaction, and
-- every other concurrent transaction for the SAME sender blocks on that
-- same lock until the first commits or rolls back — turning "N transactions
-- race to read then write" into "N transactions queue and each sees the
-- previous one's result." A fixed 1-minute window (not sliding, unlike
-- the app-level dmMessageRateLimiter) — simpler to make race-free, and
-- this is the backstop that can't be bypassed, not the primary UX-facing
-- limiter.
create table dm_rate_limit_state (
  sender_id uuid primary key references profiles (id) on delete cascade,
  window_start timestamptz not null default now(),
  count integer not null default 0
);

-- No policies at all (default-deny for every role); only ever touched by
-- this security-definer trigger function, which — same as every other
-- security-definer function in this schema — runs as the owning role and
-- so isn't itself subject to RLS. Enabled anyway for defense-in-depth,
-- matching this schema's own established style.
alter table dm_rate_limit_state enable row level security;
revoke all on table dm_rate_limit_state from authenticated, anon, public;

create or replace function enforce_dm_rate_limit() returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_state record;
begin
  insert into dm_rate_limit_state (sender_id, window_start, count)
  values (new.sender_id, now(), 0)
  on conflict (sender_id) do nothing;

  select * into v_state from dm_rate_limit_state where sender_id = new.sender_id for update;

  if now() - v_state.window_start >= interval '1 minute' then
    update dm_rate_limit_state set window_start = now(), count = 1 where sender_id = new.sender_id;
  else
    if v_state.count >= 30 then
      raise exception 'Too many messages sent recently. Please slow down.';
    end if;
    update dm_rate_limit_state set count = count + 1 where sender_id = new.sender_id;
  end if;

  return new;
end;
$$;

-- 3. Pagination boundary loss. A timestamp-only cursor with strict </>
-- can silently skip (or, depending on direction, duplicate) any message
-- that shares its exact created_at with the cursor row — rare but real,
-- especially under concurrent senders. Fixed with true keyset pagination
-- on the composite key (created_at, id), via two SQL functions rather
-- than PostgREST's or=() filter string (whose value-parsing around a
-- literal-dot-bearing ISO timestamp isn't worth relying on when a native
-- Postgres row comparison does the same thing unambiguously). security
-- invoker (the default, stated explicitly) — these are query helpers, not
-- an authorization layer, so dm_messages_select_own still fully applies
-- to the calling user exactly as it would for a direct select.
create function fetch_dm_messages_after(
  p_thread_id uuid,
  p_after_created_at timestamptz,
  p_after_id uuid,
  p_limit integer
)
returns setof dm_messages
language sql
stable
security invoker
set search_path = public
as $$
  select * from dm_messages
  where thread_id = p_thread_id
    and (created_at, id) > (p_after_created_at, p_after_id)
  order by created_at asc, id asc
  limit p_limit;
$$;

create function fetch_dm_messages_before(
  p_thread_id uuid,
  p_before_created_at timestamptz,
  p_before_id uuid,
  p_limit integer
)
returns setof dm_messages
language sql
stable
security invoker
set search_path = public
as $$
  select * from dm_messages
  where thread_id = p_thread_id
    and (created_at, id) < (p_before_created_at, p_before_id)
  order by created_at desc, id desc
  limit p_limit;
$$;

grant execute on function fetch_dm_messages_after(uuid, timestamptz, uuid, integer) to authenticated;
grant execute on function fetch_dm_messages_before(uuid, timestamptz, uuid, integer) to authenticated;
