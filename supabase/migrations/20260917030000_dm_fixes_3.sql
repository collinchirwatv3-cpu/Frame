-- FRAME — third round of DM review fixes, layered on top of
-- 20260917000000_direct_messages.sql, 20260917010000_dm_fixes.sql, and
-- 20260917020000_dm_fixes_2.sql (all already applied remotely — this is a
-- new migration, not an edit to any of them).
--
-- Finding 2 (acknowledge only loaded messages): mark_dm_thread_read wrote
-- now() as the read marker, not a boundary tied to what the client
-- actually fetched. A message inserted between the client's last fetch and
-- its mark-read call would fall before now() and get silently marked
-- read despite never having been loaded. Fixed by making the read
-- boundary an explicit, database-validated (message_id, created_at) pair
-- — "validated" meaning the RPC confirms that message genuinely exists in
-- this thread before accepting it as a read position, not just trusting
-- whatever timestamp a client claims.
--
-- Composite, not created_at alone, for the same reason pagination needed
-- (created_at, id): two messages can share an exact timestamp, and a
-- bare-timestamp read boundary can't distinguish "read through the first
-- of a tied pair" from "read through both."
alter table dm_threads
  add column last_message_id uuid references dm_messages (id) on delete set null,
  add column user_a_last_read_message_id uuid references dm_messages (id) on delete set null,
  add column user_b_last_read_message_id uuid references dm_messages (id) on delete set null;

create or replace function touch_dm_thread_on_message() returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update dm_threads set last_message_at = new.created_at, last_message_id = new.id where id = new.thread_id;
  return new;
end;
$$;

-- Replaces the now()-based version. Three properties, each load-bearing:
--   1. Validated boundary — the (p_through_created_at, p_through_id) pair
--      must reference a real row in THIS thread, or the call is rejected
--      outright. A client can't claim to have read further than any
--      message that actually exists.
--   2. Monotonic, per-side — only advances if the new boundary is later
--      than what's already recorded for the calling side of the thread
--      (explicit created_at/id tie-break, not a row-tuple comparison,
--      which would evaluate to NULL rather than false when the existing
--      read column is NULL and short-circuit unreliably otherwise).
--      Advancing-only means a stale or out-of-order call is automatically
--      a safe no-op — this also subsumes 20260917010000's realtime-loop
--      fix: a call that doesn't advance performs no UPDATE, so it can't
--      emit a change event for the caller's own subscription to loop on.
--   3. Caller-only — scoped to whichever side of user_a/user_b the caller
--      actually is, via the initial SELECT's own WHERE clause.
create or replace function mark_dm_thread_read(
  target_thread_id uuid,
  p_through_created_at timestamptz,
  p_through_id uuid
) returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_row dm_threads%rowtype;
  v_advances boolean;
begin
  select * into v_row from dm_threads where id = target_thread_id and (user_a_id = v_me or user_b_id = v_me);
  if not found then
    return;
  end if;

  if not exists (
    select 1 from dm_messages
    where id = p_through_id and thread_id = target_thread_id and created_at = p_through_created_at
  ) then
    raise exception 'Invalid read boundary — message not found in this thread';
  end if;

  if v_row.user_a_id = v_me then
    v_advances := v_row.user_a_last_read_at is null
      or v_row.user_a_last_read_at < p_through_created_at
      or (v_row.user_a_last_read_at = p_through_created_at and v_row.user_a_last_read_message_id < p_through_id);
    if v_advances then
      update dm_threads
      set user_a_last_read_at = p_through_created_at, user_a_last_read_message_id = p_through_id
      where id = target_thread_id;
    end if;
  else
    v_advances := v_row.user_b_last_read_at is null
      or v_row.user_b_last_read_at < p_through_created_at
      or (v_row.user_b_last_read_at = p_through_created_at and v_row.user_b_last_read_message_id < p_through_id);
    if v_advances then
      update dm_threads
      set user_b_last_read_at = p_through_created_at, user_b_last_read_message_id = p_through_id
      where id = target_thread_id;
    end if;
  end if;
end;
$$;

revoke execute on function mark_dm_thread_read(uuid, timestamptz, uuid) from authenticated, anon, public;
grant execute on function mark_dm_thread_read(uuid, timestamptz, uuid) to authenticated;

-- The old two-argument signature is superseded, not just shadowed —
-- callers must supply a real boundary now, so leaving an unauthenticated
-- now()-based overload reachable would silently reopen finding 2.
drop function if exists mark_dm_thread_read(uuid);
