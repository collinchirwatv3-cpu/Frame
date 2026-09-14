-- FRAME — fourth round of DM review fixes, layered on top of
-- 20260917000000_direct_messages.sql through 20260917040000_dm_fixes_4.sql
-- (all already applied remotely — this is a new migration, not an edit to
-- any of them).

-- 1. Concurrent read acknowledgements. mark_dm_thread_read (as of
-- 20260917030000_dm_fixes_3.sql) read the thread row with a plain SELECT,
-- decided in PL/pgSQL whether the new boundary advanced things, and only
-- THEN issued an UPDATE — a classic check-then-act race. Two concurrent
-- calls for the same side (e.g. two drain pages acknowledged back to back,
-- or two browser tabs) can both read the SAME pre-update snapshot, both
-- independently decide "yes, this advances," and then commit in either
-- order — if the call carrying the LATER boundary happens to commit
-- first, the call carrying the EARLIER boundary still goes on to
-- unconditionally overwrite it, regressing read progress.
--
-- Fixed by moving the entire decision into the UPDATE's own WHERE clause:
-- there is no separate read-then-decide step for a concurrent call to race
-- against. Postgres locks the row as it evaluates an UPDATE's WHERE
-- clause and applies the SET, so two concurrent UPDATEs against the same
-- row always serialize — the second to actually apply re-evaluates its
-- own WHERE clause against the FIRST's already-committed result, never a
-- stale snapshot. A call whose boundary has since been superseded simply
-- fails its own WHERE clause (0 rows affected) instead of blindly writing.
--
-- The existence/authorization check (real thread, caller is a participant)
-- and the read-boundary validation (the message genuinely exists in this
-- thread) don't need this treatment — they're not part of the racy
-- decision, just a precondition checked once up front.
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
begin
  if not exists (
    select 1 from dm_threads
    where id = target_thread_id and (user_a_id = v_me or user_b_id = v_me)
  ) then
    return;
  end if;

  if not exists (
    select 1 from dm_messages
    where id = p_through_id and thread_id = target_thread_id and created_at = p_through_created_at
  ) then
    raise exception 'Invalid read boundary — message not found in this thread';
  end if;

  -- Exactly one of these two UPDATEs can ever match a given row (a caller
  -- is user_a XOR user_b, never both) — running both unconditionally
  -- rather than branching in PL/pgSQL keeps the whole decision inside
  -- plain, atomic UPDATE statements. user_a_last_read_message_id is null
  -- is also accepted at a tied timestamp: a legacy row backfilled from a
  -- timestamp-only read marker (see the backfill below) can have a read
  -- timestamp with no corresponding message id yet, and a real boundary
  -- at that exact instant should still count as an advance in that case.
  update dm_threads
  set user_a_last_read_at = p_through_created_at, user_a_last_read_message_id = p_through_id
  where id = target_thread_id
    and user_a_id = v_me
    and (
      user_a_last_read_at is null
      or user_a_last_read_at < p_through_created_at
      or (user_a_last_read_at = p_through_created_at
          and (user_a_last_read_message_id is null or user_a_last_read_message_id < p_through_id))
    );

  update dm_threads
  set user_b_last_read_at = p_through_created_at, user_b_last_read_message_id = p_through_id
  where id = target_thread_id
    and user_b_id = v_me
    and (
      user_b_last_read_at is null
      or user_b_last_read_at < p_through_created_at
      or (user_b_last_read_at = p_through_created_at
          and (user_b_last_read_message_id is null or user_b_last_read_message_id < p_through_id))
    );
end;
$$;

-- 2. Latest-message position. touch_dm_thread_on_message unconditionally
-- overwrote last_message_at/last_message_id with whatever row's trigger
-- happened to fire, regardless of whether a LATER message's trigger had
-- already committed a more advanced position. Concurrent inserts (or two
-- messages sharing the exact same created_at, whose triggers can commit
-- in either order regardless of which row has the larger id) could leave
-- the thread's stored "latest" position behind the true latest message —
-- which readers use directly for unread detection (isUnread in dm.ts).
--
-- Same fix shape as (1): the advancement decision moves into the UPDATE's
-- own WHERE clause instead of an unconditional SET, so two concurrent
-- triggers for the same thread serialize on the row and each one's WHERE
-- clause is evaluated against the other's already-committed result — the
-- trigger for an older (or tied-but-lower-id) message can never regress a
-- newer message's already-recorded position, independent of commit order.
create or replace function touch_dm_thread_on_message() returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update dm_threads
  set last_message_at = new.created_at, last_message_id = new.id
  where id = new.thread_id
    and (
      last_message_at is null
      or last_message_at < new.created_at
      or (last_message_at = new.created_at and (last_message_id is null or last_message_id < new.id))
    );
  return new;
end;
$$;

-- 3. Migration of existing threads. 20260917030000_dm_fixes_3.sql added
-- last_message_id / user_a_last_read_message_id / user_b_last_read_message_id
-- as plain nullable columns with no backfill — every thread that existed
-- before that migration ran has last_message_id = null regardless of
-- whether it actually has messages. dm.ts's isUnread() treats a null
-- last_message_id as "nothing to be unread about" unconditionally
-- (`if (!lastMessageAt || !lastMessageId) return false;`), so every
-- pre-existing thread with a genuinely unread message silently stopped
-- showing as unread the moment 20260917030000 landed.
--
-- Implemented as a callable function (backfill_dm_thread_positions),
-- invoked once immediately below so migration application itself performs
-- the backfill with no separate manual step — kept as a standing function
-- rather than inlined so it can also be re-run (idempotently: see the
-- "is null" guards below) as a live, empirically-checkable correctness
-- test against freshly-seeded legacy-shaped data, not just asserted from
-- reading this file. Not reachable by ordinary clients.
create function backfill_dm_thread_positions() returns void
language plpgsql
security definer set search_path = public
as $$
begin
  -- Latest-message position: always recomputed from the actual message
  -- table (the true (created_at, id) maximum), not merely "fill in the id
  -- next to whatever last_message_at already says" — this is also
  -- self-healing against any drift finding (2) above's race could have
  -- left behind on a thread that received messages before this migration.
  -- distinct on (thread_id) with this ORDER BY picks, per thread, the
  -- single message with the greatest (created_at, id) tuple — ties are
  -- broken by id descending, so an unmigrated thread's stored position
  -- always lands on a real message, never ambiguous between several rows
  -- that share the winning timestamp.
  update dm_threads t
  set last_message_at = m.created_at, last_message_id = m.id
  from (
    select distinct on (thread_id) thread_id, id, created_at
    from dm_messages
    order by thread_id, created_at desc, id desc
  ) m
  where t.id = m.thread_id;

  -- Per-side read position: reconstructed from the legacy, timestamp-only
  -- last_read_at the OLD mark_dm_thread_read(uuid) (pre-20260917030000)
  -- recorded — which meant "every message with created_at <= this instant
  -- is read," a coarser, purely-timestamp-based notion of "read" than the
  -- new composite boundary. Mapped onto the single real message that
  -- represents the same cutoff under the new (created_at, id) ordering:
  -- the latest message at or before that instant, ties again broken by id
  -- descending — so a legacy read marker landing exactly on a tied
  -- timestamp maps to the HIGHEST-id message in that tie, which is what
  -- makes it "read," and mark_dm_thread_read's own tie-break condition
  -- then correctly treats every other message in that same tie as already
  -- covered too, matching the old coarser semantics instead of
  -- accidentally narrowing it. Guarded with "is null" (never overwrite an
  -- already-set position — including one this same function already
  -- backfilled, or a real value written since by an actual
  -- mark_dm_thread_read(3-arg) call) so this is safe to re-run. A
  -- last_read_at with literally no qualifying message (predates every
  -- message in the thread — only possible for corrupted/pathological
  -- data, since ordinary use only ever sets last_read_at to a real
  -- message's own created_at) is deliberately left null rather than
  -- guessed at; dm.ts's isUnread() treats a null read id conservatively,
  -- as unread, which is the safe default here.
  update dm_threads t
  set user_a_last_read_message_id = m.id
  from (
    select distinct on (dm.thread_id) dm.thread_id, dm.id
    from dm_messages dm
    join dm_threads dt on dt.id = dm.thread_id
    where dm.created_at <= dt.user_a_last_read_at
    order by dm.thread_id, dm.created_at desc, dm.id desc
  ) m
  where t.id = m.thread_id
    and t.user_a_last_read_at is not null
    and t.user_a_last_read_message_id is null;

  update dm_threads t
  set user_b_last_read_message_id = m.id
  from (
    select distinct on (dm.thread_id) dm.thread_id, dm.id
    from dm_messages dm
    join dm_threads dt on dt.id = dm.thread_id
    where dm.created_at <= dt.user_b_last_read_at
    order by dm.thread_id, dm.created_at desc, dm.id desc
  ) m
  where t.id = m.thread_id
    and t.user_b_last_read_at is not null
    and t.user_b_last_read_message_id is null;
end;
$$;

revoke execute on function backfill_dm_thread_positions() from authenticated, anon, public;

select backfill_dm_thread_positions();
