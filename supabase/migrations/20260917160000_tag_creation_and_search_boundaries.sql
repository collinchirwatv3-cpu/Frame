-- Atomic creation must be the only client creation path. Keep service-role
-- ingestion available; create_video_with_tags runs as its trusted owner.
revoke insert on table public.videos from public, anon, authenticated;
drop policy if exists videos_insert_own on public.videos;

-- RLS also lets owners read private and unfinished uploads. Public discovery
-- must explicitly exclude these before ordering and pagination.
create or replace function search_videos_by_tags(
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
  where v.visibility = 'public'
    and v.processing_status = 'ready'
    and v.content_type = any(p_content_types::video_content_type[])
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
