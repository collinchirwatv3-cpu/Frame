-- FRAME — Monetization, Milestone 3: ad_impressions + the two functions
-- that are the only writers of anything in this feature that isn't a
-- plain owner-scoped insert. Together with organic_watch_sessions
-- (20260808090000_watch_sessions.sql), this is where "paid impressions
-- never count toward monetization revenue or eligibility" actually lives.
create type ad_placement as enum ('shorts_feed', 'longform_preroll', 'longform_midroll');

create table ad_impressions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns (id) on delete cascade,
  placement ad_placement not null,
  context_video_id uuid not null references videos (id) on delete cascade,
  viewer_id uuid references profiles (id) on delete set null,
  anon_id text,
  cpm_cents integer not null,
  served_at timestamptz not null default now()
);

create index ad_impressions_campaign_id_idx on ad_impressions (campaign_id);
create index ad_impressions_context_video_id_idx on ad_impressions (context_video_id);
-- Used by record_ad_impression's frequency-cap check and by the
-- watch-sessions-start route's "did this viewer really see this ad"
-- cross-check below.
create index ad_impressions_campaign_viewer_idx on ad_impressions (campaign_id, viewer_id, served_at);
create index ad_impressions_campaign_anon_idx on ad_impressions (campaign_id, anon_id, served_at);

alter table ad_impressions enable row level security;
-- Deliberately no policy of any kind, for any operation — this table isn't
-- meant to be client-readable even in aggregate (Milestone 5's earnings
-- dashboard reads revenue_ledger instead, never this table directly), and
-- the RLS-default-deny that gives is backed up with an explicit revoke,
-- same defense-in-depth posture as every other table in this feature.
revoke insert, update, delete on table ad_impressions from authenticated, anon, public;

-- The only writer of ad_impressions, and it is NOT client-callable at
-- all — no EXECUTE grant to authenticated/anon, only ever invoked from
-- the service-role /api/ads/serve route. Structurally can't serve
-- anything in Phase 1 until a campaign actually reaches status =
-- 'active', which needs Phase 2 (Stripe) or a manual QA flip — that's
-- intentional, not a bug, same note as the module's own design doc.
--
-- Frequency-cap enforcement reads the same viewer/anon index used for the
-- watch-sessions cross-check above — one shared definition of "how many
-- times has this viewer already seen this campaign today," not two.
create function record_ad_impression(
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
          or (p_viewer_id is null and p_anon_id is not null and anon_id = p_anon_id)
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

-- Full parameter-type signature required (not just the bare name) — a
-- bare-name revoke can silently no-op if Postgres can't unambiguously
-- resolve the function, same lesson 20260807040000_actually_lock_down_rpcs.sql
-- already had to learn once for a different reason (PUBLIC's implicit
-- grant, not signature ambiguity) — being explicit here costs nothing.
revoke execute on function record_ad_impression(uuid, ad_placement, uuid, uuid, text) from public;
-- No grant to authenticated/anon at all — service-role bypasses grants
-- entirely, so the only caller that can ever reach this is
-- /api/ads/serve, which uses the service-role client.

-- The only client-facing function in this migration. Proves ownership of
-- the session via client_session_token (works for signed-out sessions
-- too, since viewer_id may be null there) rather than trusting
-- session_id alone, and clamps the claimed delta server-side regardless
-- of what's asked for — same discipline the adjust_video_counter incident
-- (20260807030000/20260807040000) taught, applied here to a fixed pair of
-- columns instead of a dynamic column name.
create function record_watch_heartbeat(
  p_session_id uuid,
  p_session_token uuid,
  p_delta_seconds numeric,
  p_position_seconds numeric
) returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_clamped_delta numeric;
begin
  v_clamped_delta := greatest(0, least(coalesce(p_delta_seconds, 0), 10));

  update watch_sessions
    set watched_seconds = watched_seconds + v_clamped_delta,
        max_position_seconds = greatest(max_position_seconds, coalesce(p_position_seconds, 0)),
        ended_at = now()
    where id = p_session_id and client_session_token = p_session_token;

  if not found then
    raise exception 'invalid session';
  end if;
end;
$$;

revoke execute on function record_watch_heartbeat(uuid, uuid, numeric, numeric) from public;
grant execute on function record_watch_heartbeat(uuid, uuid, numeric, numeric) to authenticated, anon;
