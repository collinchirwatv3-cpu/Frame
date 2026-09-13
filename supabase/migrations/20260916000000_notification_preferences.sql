-- FRAME — Notification preferences. Only the three categories that have a
-- real, currently-shipping producer get a toggle: party_starting, comments,
-- follows. Likes has no toggle at all (matches the brief's own "Likes:
-- Inbox only" note — always fires, unchanged, same as today) and there is
-- no push channel yet for any category to distinguish in-app vs push, so
-- this table only ever gates whether the in-app notification itself gets
-- created. New Frames from followed creators gets no column here either —
-- no producer exists for that yet, and a preference for a notification
-- that can never fire is exactly the kind of dead control this pass is
-- supposed to remove elsewhere, not add here.
--
-- No default-row-on-signup trigger: a missing row means "all defaults",
-- both here and in every enforcement point below (coalesce(..., true)) —
-- simpler than backfilling a row for every existing profile, and the
-- client only ever upserts once someone actually changes a setting.
create table notification_preferences (
  user_id uuid primary key references profiles (id) on delete cascade,
  party_starting boolean not null default true,
  comments boolean not null default true,
  follows boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table notification_preferences enable row level security;

-- Legitimately client-writable, same posture as device_tokens: a user's own
-- preference row is a normal, non-privileged write, not a state transition
-- that needs a security-definer gate the way marking someone else's
-- notification read would be.
create policy notification_preferences_own on notification_preferences
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Re-defines notify_on_comment/notify_on_follow/claim_and_notify_due_parties
-- (unchanged bodies otherwise) to consult preferences before inserting —
-- "all notification producers must consult preferences at the database
-- boundary," not a client-side check a caller could bypass entirely by
-- skipping the app. notify_on_like is NOT touched: likes have no toggle.
create or replace function notify_on_comment() returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_creator_id uuid;
  v_enabled boolean;
begin
  select creator_id into v_creator_id from videos where id = new.video_id;
  if v_creator_id is null or v_creator_id = new.user_id then
    return new;
  end if;
  select comments into v_enabled from notification_preferences where user_id = v_creator_id;
  if coalesce(v_enabled, true) then
    insert into notifications (recipient_id, actor_id, type, video_id, comment_id)
    values (v_creator_id, new.user_id, 'comment', new.video_id, new.id);
  end if;
  return new;
end;
$$;

create or replace function notify_on_follow() returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_enabled boolean;
begin
  select follows into v_enabled from notification_preferences where user_id = new.followee_id;
  if coalesce(v_enabled, true) then
    insert into notifications (recipient_id, actor_id, type)
    values (new.followee_id, new.follower_id, 'follow');
  end if;
  return new;
end;
$$;

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
    if not (
      v_party.last_notified_at is null
      or (v_party.repeat_rule = 'daily' and now() - v_party.last_notified_at >= interval '1 day')
      or (v_party.repeat_rule = 'weekly' and now() - v_party.last_notified_at >= interval '7 days')
    ) then
      continue;
    end if;

    begin
      insert into notifications (recipient_id, actor_id, type, party_id)
      select f.follower_id, v_party.host_id, 'party_starting', v_party.id
      from follows f
      left join notification_preferences np on np.user_id = f.follower_id
      where f.followee_id = v_party.host_id
        and coalesce(np.party_starting, true);
      get diagnostics v_recipient_count = row_count;

      update watch_parties set last_notified_at = now() where id = v_party.id;

      party_id := v_party.id;
      notified_count := v_recipient_count;
      outcome := 'notified';
      return next;
    exception when others then
      party_id := v_party.id;
      notified_count := 0;
      outcome := 'failed: ' || sqlerrm;
      return next;
    end;
  end loop;
end;
$$;

revoke execute on function notify_on_comment() from authenticated, anon, public;
revoke execute on function notify_on_follow() from authenticated, anon, public;
revoke execute on function claim_and_notify_due_parties() from authenticated, anon, public;
