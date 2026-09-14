-- Message replies remain in their source thread. Column grants preserve
-- server-generated IDs/timestamps and the existing send/RLS/rate boundaries.
alter table dm_messages
  add constraint dm_messages_thread_message_key unique (thread_id, id),
  add column reply_to_id uuid,
  add constraint dm_messages_reply_same_thread
    foreign key (thread_id, reply_to_id) references dm_messages (thread_id, id),
  add constraint dm_messages_reply_not_self check (reply_to_id is null or reply_to_id <> id);
create index dm_messages_reply_idx on dm_messages (thread_id, reply_to_id) where reply_to_id is not null;
grant insert (reply_to_id) on dm_messages to authenticated;

-- One reaction per participant per message. Removing a reaction writes a
-- null emoji: UPDATE events retain the participant-scoped RLS boundary,
-- unlike Postgres Changes DELETE delivery. No direct client mutations.
create table dm_reactions (
  message_id uuid not null,
  thread_id uuid not null,
  user_id uuid not null references profiles (id) on delete cascade,
  emoji text check (emoji in ('❤️', '👍', '😂', '😮', '😢', '🙏')),
  primary key (message_id, user_id),
  foreign key (thread_id, message_id) references dm_messages (thread_id, id) on delete cascade
);
create index dm_reactions_thread_idx on dm_reactions (thread_id, message_id);
alter table dm_reactions enable row level security;
revoke all on dm_reactions from public, anon, authenticated;
grant select on dm_reactions to authenticated;
create policy dm_reactions_read_participant on dm_reactions for select to authenticated
  using (exists (
    select 1 from dm_threads t where t.id = dm_reactions.thread_id
      and auth.uid() in (t.user_a_id, t.user_b_id)
  ));

create table dm_reaction_rate_state (
  user_id uuid primary key references profiles (id) on delete cascade,
  window_start timestamptz not null,
  count integer not null
);
alter table dm_reaction_rate_state enable row level security;
revoke all on dm_reaction_rate_state from public, anon, authenticated;

-- Explicit set semantics make retries idempotent. The caller's identity
-- and the target's thread are derived on the server, never supplied by UI.
create function set_dm_reaction(p_message_id uuid, p_emoji text) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_thread uuid;
  v_now timestamptz := clock_timestamp();
  v_count integer;
begin
  if v_me is null or not is_invited(v_me) then
    raise exception 'Messaging unavailable';
  end if;
  if p_emoji is not null and p_emoji not in ('❤️', '👍', '😂', '😮', '😢', '🙏') then
    raise exception 'Invalid reaction';
  end if;
  select t.id into v_thread from dm_messages m join dm_threads t on t.id = m.thread_id
  where m.id = p_message_id and v_me in (t.user_a_id, t.user_b_id)
    and not is_blocked_pair(t.user_a_id, t.user_b_id);
  if not found then raise exception 'Messaging unavailable'; end if;

  insert into dm_reaction_rate_state (user_id, window_start, count) values (v_me, v_now, 1)
  on conflict (user_id) do update
    set window_start = case when dm_reaction_rate_state.window_start <= v_now - interval '1 minute'
                           then v_now else dm_reaction_rate_state.window_start end,
        count = case when dm_reaction_rate_state.window_start <= v_now - interval '1 minute'
                     then 1 else dm_reaction_rate_state.count + 1 end
    where dm_reaction_rate_state.window_start <= v_now - interval '1 minute'
       or dm_reaction_rate_state.count < 60
  returning count into v_count;
  if not found then raise exception 'Too many reactions. Please slow down.'; end if;

  insert into dm_reactions (message_id, thread_id, user_id, emoji)
    values (p_message_id, v_thread, v_me, p_emoji)
  on conflict (message_id, user_id) do update set emoji = excluded.emoji
    where dm_reactions.emoji is distinct from excluded.emoji;
end;
$$;
revoke execute on function set_dm_reaction(uuid, text) from public, anon, authenticated;
grant execute on function set_dm_reaction(uuid, text) to authenticated;
alter publication supabase_realtime add table dm_reactions;
