-- Real per-video view counts. videos.view_count has never existed — the app
-- has deliberately shown no views stat anywhere rather than a fake one (see
-- Video.createdAt's doc comment in lib/types.ts). This adds the real thing.
--
-- Distinct-viewer semantics, not a raw watch-event log: video_views is an
-- insert-once (video_id, user_id) marker, and view_count only increments the
-- first time a given signed-in viewer crosses the "watched" threshold for a
-- given video — the same >3s threshold VideoCard.tsx already uses for
-- watch_progress history, reused here rather than inventing a second number.
-- Refreshing, rewatching, or calling the RPC repeatedly for a video already
-- marked watched is a no-op; this can only ever move a video's count up by
-- at most 1 per real signed-in viewer, so there's no per-video rate limiter
-- needed the way dm_reactions/set_dm_reaction needed one for a repeatable
-- action — same reasoning lock_down_videos_update.sql already applied
-- (revoke direct table access outright, one security-definer RPC as the
-- only write path).
--
-- Scope, stated honestly: authenticated invited viewers only. /watch/[id]
-- and /s/[token] both allow signed-out browsing (videos' SELECT policies
-- are untouched, per invite_gate_rls.sql's own note) — those views are not
-- counted here. Extending this to anonymous viewers would need session/
-- anon_id dedup like watch_sessions.anon_id already does for ad accounting;
-- deliberately not attempted in this pass rather than faking anon dedup.
create table video_views (
  video_id uuid not null references videos (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (video_id, user_id)
);
alter table video_views enable row level security;
revoke all on video_views from public, anon, authenticated;
-- No client SELECT grant — the count itself is read via videos.view_count,
-- already publicly selectable same as likes_count/comments_count/etc.

alter table videos add column view_count integer not null default 0;

create function record_video_view(p_video_id uuid) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null or not is_invited(v_me) then
    raise exception 'Not available';
  end if;

  if not exists (
    select 1 from videos
    where id = p_video_id and visibility = 'public' and processing_status = 'ready'
  ) then
    raise exception 'Not available';
  end if;

  insert into video_views (video_id, user_id)
  values (p_video_id, v_me)
  on conflict (video_id, user_id) do nothing;

  if found then
    update videos set view_count = view_count + 1 where id = p_video_id;
  end if;
end;
$$;
revoke execute on function record_video_view(uuid) from public, anon, authenticated;
grant execute on function record_video_view(uuid) to authenticated;
