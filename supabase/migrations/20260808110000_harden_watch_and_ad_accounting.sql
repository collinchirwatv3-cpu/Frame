-- FRAME — close direct-write and attribution bypasses in monetization accounting.
--
-- Browser clients must not be able to create accounting rows or invoke a
-- heartbeat directly. Both operations are now performed only by authenticated
-- server routes using the service-role client; this migration keeps the
-- database function as the authoritative time-bound accounting implementation.

revoke insert, update, delete on table watch_sessions from authenticated, anon, public;
revoke execute on function record_watch_heartbeat(uuid, uuid, numeric, numeric) from authenticated, anon, public;

create or replace function record_watch_heartbeat(
  p_session_id uuid,
  p_session_token uuid,
  p_delta_seconds numeric,
  p_position_seconds numeric
) returns void
language plpgsql
security definer set search_path = public
as $$
declare
  -- Postgres rejects mixing a %rowtype record with scalar columns in one
  -- INTO list ("record variable cannot be part of multiple-item INTO
  -- list") — plain scalars for the two watch_sessions fields actually used
  -- below (id, started_at) instead of capturing the whole row.
  v_session_id uuid;
  v_started_at timestamptz;
  v_duration_seconds numeric;
  v_clamped_delta numeric;
  v_max_watched_seconds numeric;
  v_elapsed_seconds numeric;
begin
  -- Locking the session makes the read/validate/update sequence atomic even
  -- when a client retries a heartbeat concurrently.
  select ws.id, ws.started_at, v.duration_seconds
    into v_session_id, v_started_at, v_duration_seconds
    from watch_sessions ws
    join videos v on v.id = ws.video_id
    where ws.id = p_session_id and ws.client_session_token = p_session_token
    for update of ws;

  if not found or v_duration_seconds is null then
    raise exception 'invalid session';
  end if;

  v_clamped_delta := greatest(0, least(coalesce(p_delta_seconds, 0), 10));
  v_elapsed_seconds := greatest(0, extract(epoch from clock_timestamp() - v_started_at));
  -- A small grace window accounts for a heartbeat arriving immediately after
  -- playback starts, but cumulative watch time can never outrun wall time or
  -- the video's real duration.
  v_max_watched_seconds := least(v_duration_seconds, v_elapsed_seconds + 5);

  update watch_sessions
    set watched_seconds = least(watched_seconds + v_clamped_delta, v_max_watched_seconds),
        max_position_seconds = greatest(
          max_position_seconds,
          least(v_duration_seconds, greatest(0, coalesce(p_position_seconds, 0)))
        ),
        ended_at = clock_timestamp()
    where id = v_session_id;
end;
$$;

-- A Promote campaign is an owner paying to boost their own video. RLS must
-- enforce that relationship because callers can use PostgREST directly.
alter policy campaigns_insert_own on campaigns
  with check (
    owner_id = auth.uid()
    and is_invited(auth.uid())
    and (
      (type = 'business_ad' and status = 'pending_review' and is_business_approved(auth.uid()))
      or (
        type = 'promote'
        and status = 'pending_payment'
        and not is_business_approved(auth.uid())
        and exists (
          select 1 from videos
          where videos.id = campaigns.video_id and videos.creator_id = auth.uid()
        )
      )
    )
  );

create or replace function record_ad_impression(
  p_campaign_id uuid,
  p_placement ad_placement,
  p_context_video_id uuid,
  p_viewer_id uuid,
  p_anon_id text
) returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_campaign campaigns%rowtype;
  v_recent_count integer;
  v_impression_id uuid;
begin
  -- Exactly one stable viewer identity is required. This prevents a service
  -- bug from creating impressions that no frequency cap can subsequently see.
  if (p_viewer_id is null) = (p_anon_id is null) then
    raise exception 'exactly one viewer identity is required';
  end if;

  -- Serialise cap checks for one campaign/viewer pair; a count followed by an
  -- insert without this lock can overserve under concurrent requests.
  perform pg_advisory_xact_lock(
    hashtextextended(
      p_campaign_id::text || ':' || coalesce(p_viewer_id::text, p_anon_id),
      0
    )
  );

  select * into v_campaign from campaigns where id = p_campaign_id;
  if not found or v_campaign.type <> 'business_ad' or v_campaign.status <> 'active' then
    raise exception 'campaign is not an active business_ad';
  end if;

  if v_campaign.frequency_cap_per_user_per_day is not null then
    select count(*) into v_recent_count
      from ad_impressions
      where campaign_id = p_campaign_id
        and served_at >= now() - interval '1 day'
        and (
          (p_viewer_id is not null and viewer_id = p_viewer_id)
          or (p_viewer_id is null and anon_id = p_anon_id)
        );
    if v_recent_count >= v_campaign.frequency_cap_per_user_per_day then
      raise exception 'frequency cap reached for this viewer';
    end if;
  end if;

  insert into ad_impressions (campaign_id, placement, context_video_id, viewer_id, anon_id, cpm_cents)
  values (p_campaign_id, p_placement, p_context_video_id, p_viewer_id, p_anon_id, v_campaign.cpm_cents)
  returning id into v_impression_id;

  return v_impression_id;
end;
$$;

revoke execute on function record_ad_impression(uuid, ad_placement, uuid, uuid, text) from public;
