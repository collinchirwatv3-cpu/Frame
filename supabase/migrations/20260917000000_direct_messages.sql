-- FRAME — Direct messages. 1:1 only (no groups in this pass). A blocked
-- pair can never message each other, in either direction, going forward —
-- enforced at the RLS boundary via is_blocked_pair (20260915000000_blocks.sql),
-- the same function already gating profiles/videos/follows for a block.
-- This does NOT retroactively hide an existing thread's history from either
-- side if they block each other later — only new messages are rejected —
-- matching the narrower "can't message" scope actually asked for, not the
-- full "can't see each other at all" treatment blocking already does
-- elsewhere.
--
-- user_a_id/user_b_id is a canonical ordering (a < b, enforced by a check
-- constraint), not "who started it" — this is what lets a unique
-- constraint guarantee at most one thread per pair without the app having
-- to de-duplicate. get_or_create_dm_thread() below is the only sanctioned
-- way to create one, so callers never have to sort the ids themselves.
create table dm_threads (
  id uuid primary key default gen_random_uuid(),
  user_a_id uuid not null references profiles (id) on delete cascade,
  user_b_id uuid not null references profiles (id) on delete cascade,
  -- Per-participant read state, not per-message — simpler, and sufficient
  -- for "does this thread have anything new," the only thing the UI needs.
  user_a_last_read_at timestamptz,
  user_b_last_read_at timestamptz,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  constraint dm_threads_ordered_pair check (user_a_id < user_b_id),
  unique (user_a_id, user_b_id)
);

create index dm_threads_user_a_idx on dm_threads (user_a_id, last_message_at desc);
create index dm_threads_user_b_idx on dm_threads (user_b_id, last_message_at desc);

create table dm_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references dm_threads (id) on delete cascade,
  sender_id uuid not null references profiles (id) on delete cascade,
  text text not null check (char_length(text) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index dm_messages_thread_id_created_at_idx on dm_messages (thread_id, created_at);

alter table dm_threads enable row level security;
alter table dm_messages enable row level security;

create policy dm_threads_select_own on dm_threads for select
  using (auth.uid() = user_a_id or auth.uid() = user_b_id);

-- No insert/update/delete grant at all — dm_threads is only ever created by
-- get_or_create_dm_thread() and only ever updated by mark_dm_thread_read()
-- or the last_message_at trigger below, all security definer. Same "narrow
-- RPC, not a table grant" posture as notifications.
revoke insert, update, delete on table dm_threads from authenticated, anon, public;

create policy dm_messages_select_own on dm_messages for select
  using (
    exists (
      select 1 from dm_threads
      where dm_threads.id = dm_messages.thread_id
        and (dm_threads.user_a_id = auth.uid() or dm_threads.user_b_id = auth.uid())
    )
  );

create policy dm_messages_insert_own on dm_messages for insert
  with check (
    auth.uid() = sender_id
    and is_invited(auth.uid())
    and exists (
      select 1 from dm_threads
      where dm_threads.id = dm_messages.thread_id
        and (dm_threads.user_a_id = auth.uid() or dm_threads.user_b_id = auth.uid())
        and not is_blocked_pair(dm_threads.user_a_id, dm_threads.user_b_id)
    )
  );

-- No delete/update grant on dm_messages — no edit/unsend in this pass.
revoke update, delete on table dm_messages from authenticated, anon, public;

create function get_or_create_dm_thread(other_user_id uuid) returns uuid
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

  select id into v_thread_id from dm_threads where user_a_id = v_a and user_b_id = v_b;
  if v_thread_id is null then
    insert into dm_threads (user_a_id, user_b_id) values (v_a, v_b) returning id into v_thread_id;
  end if;

  return v_thread_id;
end;
$$;

revoke execute on function get_or_create_dm_thread(uuid) from authenticated, anon, public;
grant execute on function get_or_create_dm_thread(uuid) to authenticated;

create function mark_dm_thread_read(target_thread_id uuid) returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  update dm_threads
  set user_a_last_read_at = case when user_a_id = v_me then now() else user_a_last_read_at end,
      user_b_last_read_at = case when user_b_id = v_me then now() else user_b_last_read_at end
  where id = target_thread_id and (user_a_id = v_me or user_b_id = v_me);
end;
$$;

revoke execute on function mark_dm_thread_read(uuid) from authenticated, anon, public;
grant execute on function mark_dm_thread_read(uuid) to authenticated;

-- Keeps dm_threads.last_message_at current for sorting the thread list by
-- recency, without the client having to (and without a client write grant
-- on dm_threads to do it with anyway).
create function touch_dm_thread_on_message() returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update dm_threads set last_message_at = new.created_at where id = new.thread_id;
  return new;
end;
$$;

create trigger dm_messages_touch_thread
  after insert on dm_messages
  for each row execute function touch_dm_thread_on_message();

-- Postgres Changes evaluates each table's own RLS for the connecting role
-- (same reasoning as notifications, 20260912000000_notifications.sql) —
-- dm_threads_select_own / dm_messages_select_own above are what actually
-- scope delivery to the two participants, not a realtime.messages policy.
alter publication supabase_realtime add table dm_threads;
alter publication supabase_realtime add table dm_messages;
