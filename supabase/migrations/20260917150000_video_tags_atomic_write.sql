-- FRAME — fixes two related findings from a review of the tag taxonomy
-- work (20260917100000 through 20260917140000, already live):
--
-- 1. Upload could report success while tags silently failed to save
--    (src/app/api/uploads/route.ts logged tag-insert errors but always
--    returned 200). Video creation + direct tag writes + inherited
--    gear/location tags now happen in one atomic function; any failure
--    rolls back the whole thing, including the video row itself.
--
-- 2. video_tags_insert_own (20260917100000) let any invited owner insert
--    ARBITRARY rows directly via PostgREST — inactive tags, wrong-facet
--    tags, unlimited counts, duplicate rows, and (worst) a self-chosen
--    source='inherited', letting a client fabricate inheritance the server
--    never derived. The route's own validation was real but only a
--    speed bump: nothing stopped a raw REST call from skipping it
--    entirely. Direct insert/delete is now revoked outright — this
--    function is the only write path, same "one RPC as the only write
--    path" posture as record_video_view/set_dm_reaction elsewhere in this
--    schema.
--
-- SECURITY DEFINER means this function bypasses videos_insert_own's own
-- RLS for its internal INSERT — that policy's WITH CHECK currently
-- enforces creator ownership, the invite gate, monetization eligibility,
-- and the business-channel Promote restriction
-- (20260808060000_monetization_enums_and_eligibility.sql,
-- 20260808070000_business_channels.sql). All four are re-implemented
-- explicitly below rather than relied on via RLS, so this function cannot
-- silently become a bypass for any of them. The table's own CHECK
-- constraint (short-duration classification backstop,
-- 20260914100000_short_duration_classification_backstop.sql) still
-- applies automatically regardless — CHECK constraints are never
-- RLS-gated.

revoke insert, delete on table video_tags from public, anon, authenticated;
drop policy if exists video_tags_insert_own on video_tags;
drop policy if exists video_tags_delete_own on video_tags;

create function create_video_with_tags(
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
  p_gear_tag_ids uuid[]
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
    width, height, duration_seconds, publish_mode, playback_url, poster_url
  ) values (
    v_me, p_stream_uid, 'uploading', p_content_type::video_content_type, p_title, p_description,
    p_width, p_height, p_duration_seconds, p_publish_mode::video_publish_mode, null, null
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
  text, text, text, text, integer, integer, numeric, text, uuid, uuid[], uuid[], uuid[], uuid, uuid[]
) from public, anon, authenticated;
grant execute on function create_video_with_tags(
  text, text, text, text, integer, integer, numeric, text, uuid, uuid[], uuid[], uuid[], uuid, uuid[]
) to authenticated;

-- ============================================================================
-- Combined-tag filtering + pagination fix. resolveTagFilterIds() in
-- video-fetch.ts previously called match_all_tags() (no ORDER BY/LIMIT of
-- its own) and then ordered+paginated the *videos* query against that
-- id list — but PostgREST caps RPC responses at its configured max-rows
-- (1000 by default), so once more than that many videos share a tag
-- combination, the id list itself gets silently truncated to an arbitrary
-- (non-recency-ordered) subset *before* the real ordering/pagination ever
-- runs, and genuinely recent matching videos can disappear entirely.
--
-- Fix: do intersection + visibility + content-type filtering + ordering +
-- pagination in one query. SECURITY INVOKER (the default — no
-- `security definer` here), so it runs under the CALLER's own RLS on
-- videos/video_tags exactly as if they'd queried those tables directly —
-- same as tag_ancestors/match_all_tags already do. Returns only
-- (id, created_at), not `select v.*`/`returns setof videos`: the videos
-- table's quality_score column must never reach a client-facing response
-- (its own doc comment in the init migration is explicit about this), and
-- `returns setof videos` would expose every column including that one.
-- Callers fetch full rows afterward via the existing safe column-list
-- SELECT, `.in("id", ids)` against this already-paginated, already-final
-- id list — safe because it's exactly the page requested, not a
-- potentially-huge unpaginated set.
create function search_videos_by_tags(
  p_tag_ids uuid[] default '{}',
  p_content_types text[] default array['film', 'longform'],
  p_limit integer default 30,
  p_offset integer default 0,
  p_exclude_ids uuid[] default '{}'
) returns table (id uuid, created_at timestamptz)
language sql
stable
as $$
  with normalized_tags as (
    select coalesce(array_agg(distinct x), '{}') as ids from unnest(p_tag_ids) x where x is not null
  )
  select v.id, v.created_at
  from videos v, normalized_tags nt
  where v.content_type = any(p_content_types::video_content_type[])
    and (p_exclude_ids is null or cardinality(p_exclude_ids) = 0 or v.id <> all(p_exclude_ids))
    and (
      cardinality(nt.ids) = 0
      or v.id in (
        select vt.video_id from video_tags vt
        where vt.tag_id = any(nt.ids)
        group by vt.video_id
        having count(distinct vt.tag_id) = cardinality(nt.ids)
      )
    )
  order by v.created_at desc, v.id desc
  limit greatest(coalesce(p_limit, 30), 0) offset greatest(coalesce(p_offset, 0), 0);
$$;
