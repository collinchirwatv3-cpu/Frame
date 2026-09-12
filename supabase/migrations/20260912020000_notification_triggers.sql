-- FRAME — notify_on_like / notify_on_comment / notify_on_follow: small,
-- independent security-definer trigger functions, deliberately NOT merged
-- into the existing on_like_change/on_comment_change/on_follow_change
-- counter triggers (20260101000000_init.sql) — smaller, independently
-- revertible diff, matching this file's own established "one function, one
-- job" granularity.
--
-- These are DB triggers, not application-code writes, on purpose: comments
-- are inserted directly from the browser client (comments-store.ts), never
-- through /api/engagement/[kind] — an app-code notification write would
-- silently miss that entire category. A trigger fires on the real INSERT
-- regardless of which code path performed it.
--
-- AFTER INSERT only — unliking/uncommenting/unfollowing doesn't retract a
-- notification retroactively, matching normal product behavior. Every
-- function skips the case where the actor is also the recipient (no
-- "you liked your own video" notification).
--
-- 'mention' and 'system' are enum values only in this migration — no
-- producer exists yet (there's no @mention parsing anywhere in the app),
-- matching Milestone 1's scope.

create function notify_on_like() returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_creator_id uuid;
begin
  select creator_id into v_creator_id from videos where id = new.video_id;
  if v_creator_id is not null and v_creator_id <> new.user_id then
    insert into notifications (recipient_id, actor_id, type, video_id)
    values (v_creator_id, new.user_id, 'like', new.video_id);
  end if;
  return new;
end;
$$;

revoke execute on function notify_on_like() from authenticated, anon, public;

create trigger notifications_on_like
  after insert on likes
  for each row execute function notify_on_like();

create function notify_on_comment() returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_creator_id uuid;
begin
  select creator_id into v_creator_id from videos where id = new.video_id;
  if v_creator_id is not null and v_creator_id <> new.user_id then
    insert into notifications (recipient_id, actor_id, type, video_id, comment_id)
    values (v_creator_id, new.user_id, 'comment', new.video_id, new.id);
  end if;
  return new;
end;
$$;

revoke execute on function notify_on_comment() from authenticated, anon, public;

create trigger notifications_on_comment
  after insert on comments
  for each row execute function notify_on_comment();

-- No actor<>recipient guard needed here — follows.no_self_follow already
-- makes follower_id = followee_id impossible at the constraint level.
create function notify_on_follow() returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into notifications (recipient_id, actor_id, type)
  values (new.followee_id, new.follower_id, 'follow');
  return new;
end;
$$;

revoke execute on function notify_on_follow() from authenticated, anon, public;

create trigger notifications_on_follow
  after insert on follows
  for each row execute function notify_on_follow();
