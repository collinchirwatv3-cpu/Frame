-- Wires up profiles.total_views (Creator.totalViews — already displayed via
-- CreatorRow.tsx's "{formatCount(creator.totalViews)} views") to the real
-- view counting the previous migration added. It was equally fake/
-- unincremented as videos.view_count was before that — just already piped
-- to the UI instead of hidden, i.e. actively showing a wrong number rather
-- than showing nothing.
--
-- Moves the counter maintenance out of record_video_view() and into a
-- trigger on video_views' insert instead, matching this schema's own
-- stated principle for denormalized counters (see adjust_video_counter /
-- on_like_change / on_save_change / on_comment_change / on_follow_change in
-- 20260101000000_init.sql): "triggers, not application code, so counts
-- stay correct regardless of which code path mutates the join tables."
-- video_views is exactly that kind of join/log table — record_video_view()
-- remains the only INSERT path into it (direct table grants stay revoked),
-- but the actual counter-bumping now lives with the table it's keyed off
-- of, not duplicated by hand if a second write path is ever added.
create function on_video_view_insert() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  update videos set view_count = view_count + 1 where id = new.video_id;
  update profiles set total_views = total_views + 1
    where id = (select creator_id from videos where id = new.video_id);
  return null;
end;
$$;

create trigger video_views_count_trigger
  after insert on video_views
  for each row execute function on_video_view_insert();

-- record_video_view no longer bumps videos.view_count inline — the trigger
-- above does it (and profiles.total_views alongside it) the moment the
-- insert actually lands. This is now just the auth/visibility-gated entry
-- point; unchanged otherwise, re-declared here since CREATE OR REPLACE
-- can't touch just the function body via ALTER.
create or replace function record_video_view(p_video_id uuid) returns void
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
end;
$$;
revoke execute on function record_video_view(uuid) from public, anon, authenticated;
grant execute on function record_video_view(uuid) to authenticated;
