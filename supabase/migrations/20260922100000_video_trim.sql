-- FRAME — trim the primary uploaded video, not just Community Clips.
-- trim_start_seconds/trim_end_seconds bound what actually plays back for a
-- video, the same way clips.start_seconds/end_seconds already bound a
-- virtual clip (VideoCard.tsx's playClip) — no re-encoding, no separate
-- Stream asset, just player-enforced bounds on the same playback_url.
-- trim_end_seconds is nullable: null means "play to the end," so every
-- existing row (and any future insert that never sets it) is untrimmed by
-- default. trim_start_seconds defaults to 0 for the same reason.
alter table videos
  add column trim_start_seconds numeric not null default 0,
  add column trim_end_seconds numeric;

-- Defense in depth, independent of create_video_with_tags' own runtime
-- checks below — same posture as videos_title_length/videos_description_length
-- (20260919100000_video_self_edit.sql): a CHECK constraint applies
-- regardless of which code path writes the row.
alter table videos
  add constraint videos_trim_bounds_check
  check (trim_start_seconds >= 0 and (trim_end_seconds is null or trim_end_seconds > trim_start_seconds));

-- create_video_with_tags (20260917150000_video_tags_atomic_write.sql) is
-- the only write path for a new video — trailing optional params with
-- defaults is how Postgres lets CREATE OR REPLACE FUNCTION extend an
-- existing function's signature without a drop, so every other still-live
-- overload/grant on the original 14-arg signature keeps working unchanged.
create or replace function create_video_with_tags(
  p_stream_uid text,
  p_content_type text,
  p_title text,
  p_description text,
  p_width integer,
  p_height integer,
  p_duration_seconds numeric,
  p_publish_mode text,
  p_content_type_tag_id uuid,
  p_genre_tag_ids uuid[],
  p_topic_tag_ids uuid[],
  p_mood_tag_ids uuid[],
  p_location_tag_id uuid,
  p_gear_tag_ids uuid[],
  p_trim_start_seconds numeric default 0,
  p_trim_end_seconds numeric default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_genre uuid[];
  v_topic uuid[];
  v_mood uuid[];
  v_gear uuid[];
  v_all uuid[];
  v_video_id uuid;
begin
  if v_me is null or not is_invited(v_me) then
    raise exception 'Not available';
  end if;
  if p_publish_mode = 'monetise' and not is_monetization_eligible(v_me) then
    raise exception 'You are not eligible to monetise videos yet';
  end if;
  if p_publish_mode = 'promote' and is_business_approved(v_me) then
    raise exception 'Business Channels can Run as an Ad instead of Promote';
  end if;

  -- Same "never trust the client for a derived boundary" posture as the
  -- route's own contentTypeFinal re-derivation — a hand-crafted call could
  -- otherwise pass a trim window past the real duration or backwards.
  if p_trim_start_seconds is null or p_trim_start_seconds < 0 or p_trim_start_seconds >= p_duration_seconds then
    raise exception 'Invalid trim start';
  end if;
  if p_trim_end_seconds is not null and (p_trim_end_seconds <= p_trim_start_seconds or p_trim_end_seconds > p_duration_seconds + 0.5) then
    raise exception 'Invalid trim end';
  end if;

  -- Normalize: dedupe and drop nulls so a client sending repeats can't
  -- inflate a count check, and a stray null in an array can't slip past
  -- the facet-membership checks below.
  select coalesce(array_agg(distinct x), '{}') into v_genre from unnest(p_genre_tag_ids) x where x is not null;
  select coalesce(array_agg(distinct x), '{}') into v_topic from unnest(p_topic_tag_ids) x where x is not null;
  select coalesce(array_agg(distinct x), '{}') into v_mood from unnest(p_mood_tag_ids) x where x is not null;
  select coalesce(array_agg(distinct x), '{}') into v_gear from unnest(p_gear_tag_ids) x where x is not null;

  if p_content_type_tag_id is null then
    raise exception 'Content type is required';
  end if;
  if array_length(v_genre, 1) is null or array_length(v_genre, 1) not between 1 and 3 then
    raise exception 'Pick 1 to 3 genres';
  end if;
  if array_length(v_topic, 1) is null or array_length(v_topic, 1) not between 1 and 5 then
    raise exception 'Pick 1 to 5 topics';
  end if;
  if array_length(v_mood, 1) > 3 then
    raise exception 'Pick up to 3 mood tags';
  end if;
  if array_length(v_gear, 1) > 60 then
    raise exception 'Too many gear tags';
  end if;

  if not exists (
    select 1 from tags t join tag_categories c on c.id = t.category_id
    where t.id = p_content_type_tag_id and t.active and c.facet = 'content_type'
  ) then
    raise exception 'Invalid content type tag';
  end if;

  if exists (
    select 1 from unnest(v_genre) gid
    where not exists (select 1 from tags t join tag_categories c on c.id = t.category_id
      where t.id = gid and t.active and c.facet = 'genre')
  ) then
    raise exception 'Invalid genre tag selection';
  end if;

  if exists (
    select 1 from unnest(v_topic) gid
    where not exists (select 1 from tags t join tag_categories c on c.id = t.category_id
      where t.id = gid and t.active and c.facet = 'topic')
  ) then
    raise exception 'Invalid topic tag selection';
  end if;

  if exists (
    select 1 from unnest(v_mood) gid
    where not exists (select 1 from tags t join tag_categories c on c.id = t.category_id
      where t.id = gid and t.active and c.facet = 'mood')
  ) then
    raise exception 'Invalid mood tag selection';
  end if;

  if p_location_tag_id is not null and not exists (
    select 1 from tags t join tag_categories c on c.id = t.category_id
    where t.id = p_location_tag_id and t.active and c.facet = 'location'
  ) then
    raise exception 'Invalid location tag';
  end if;

  if exists (
    select 1 from unnest(v_gear) gid
    where not exists (select 1 from tags t join tag_categories c on c.id = t.category_id
      where t.id = gid and t.active and c.facet = 'gear')
  ) then
    raise exception 'Invalid gear tag selection';
  end if;

  insert into videos (
    creator_id, stream_uid, processing_status, content_type, title, description,
    width, height, duration_seconds, publish_mode, playback_url, poster_url,
    trim_start_seconds, trim_end_seconds
  ) values (
    v_me, p_stream_uid, 'uploading', p_content_type::video_content_type, p_title, p_description,
    p_width, p_height, p_duration_seconds, p_publish_mode::video_publish_mode, null, null,
    p_trim_start_seconds, p_trim_end_seconds
  )
  returning id into v_video_id;

  v_all := array[p_content_type_tag_id] || v_genre || v_topic || v_mood;
  if p_location_tag_id is not null then
    v_all := v_all || p_location_tag_id;
  end if;
  v_all := v_all || v_gear;

  insert into video_tags (video_id, tag_id, source)
  select v_video_id, x, 'creator' from unnest(v_all) x;

  if array_length(v_gear, 1) > 0 then
    insert into video_tags (video_id, tag_id, source)
    select v_video_id, ti.implied_tag_id, 'inherited'
    from tag_implies ti
    where ti.tag_id = any(v_gear)
      and ti.implied_tag_id <> all(v_all)
    on conflict (video_id, tag_id) do nothing;
  end if;

  if p_location_tag_id is not null then
    insert into video_tags (video_id, tag_id, source)
    select v_video_id, a.id, 'inherited'
    from tag_ancestors(p_location_tag_id) a
    where a.id <> all(v_all)
    on conflict (video_id, tag_id) do nothing;
  end if;

  return v_video_id;
end;
$$;

revoke execute on function create_video_with_tags(
  text, text, text, text, integer, integer, numeric, text, uuid, uuid[], uuid[], uuid[], uuid, uuid[], numeric, numeric
) from public, anon, authenticated;
grant execute on function create_video_with_tags(
  text, text, text, text, integer, integer, numeric, text, uuid, uuid[], uuid[], uuid[], uuid, uuid[], numeric, numeric
) to authenticated;
