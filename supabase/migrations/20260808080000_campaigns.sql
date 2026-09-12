-- FRAME — Monetization, Milestone 1c: campaigns. Backs both Promote
-- (creator pays 2x the base ad rate to boost their own video's visibility)
-- and Run as an Ad (Business Channels only, base CPM). Two very different
-- products sharing one table because they share the same lifecycle shape
-- (created -> reviewed/paid -> active -> completed) and the same anti-
-- gaming requirement downstream: nothing here ever counts as organic
-- attention (see ad_impressions/watch_sessions, Milestone 3).
create type campaign_type as enum ('promote', 'business_ad');
create type campaign_status as enum (
  'pending_review', 'pending_payment', 'active', 'paused', 'completed', 'rejected'
);

create table campaigns (
  id uuid primary key default gen_random_uuid(),
  type campaign_type not null,
  owner_id uuid not null references profiles (id) on delete cascade,
  video_id uuid references videos (id) on delete cascade,
  status campaign_status not null,
  cpm_cents integer not null check (cpm_cents > 0),
  daily_cap_cents integer check (daily_cap_cents is null or daily_cap_cents > 0),
  frequency_cap_per_user_per_day integer check (frequency_cap_per_user_per_day is null or frequency_cap_per_user_per_day > 0),
  starts_at timestamptz,
  ends_at timestamptz,
  -- Phase 2 integration point — no Stripe integration exists yet, this
  -- column is simply unwritten in Phase 1. Only a future Stripe webhook can
  -- populate it and move status to 'active'.
  stripe_payment_intent_id text,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  constraint campaigns_promote_requires_video check (type <> 'promote' or video_id is not null)
);

create index campaigns_owner_id_idx on campaigns (owner_id);
create index campaigns_status_idx on campaigns (status);

alter table campaigns enable row level security;

create policy campaigns_select_own_or_moderator on campaigns
  for select using (
    owner_id = auth.uid()
    or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_moderator)
  );

-- Every condition here is structural, not an application-layer nicety:
-- - owner_id must be the caller (can't create a campaign on someone else's
--   behalf).
-- - the starting status is pinned per type — a business_ad always starts
--   'pending_review' (goes to moderator review, Milestone 7), a promote
--   always starts 'pending_payment' (no review needed, just payment, which
--   doesn't exist yet in Phase 1 — see the module comment above).
-- - is_invited/is_business_approved are re-checked here independently of
--   the same checks already living on videos_insert_own — a campaign can
--   be created for an existing video without re-inserting it, so this
--   table needs its own copy of the gate, not a borrowed one.
create policy campaigns_insert_own on campaigns
  for insert with check (
    owner_id = auth.uid()
    and is_invited(auth.uid())
    and (
      (type = 'business_ad' and status = 'pending_review' and is_business_approved(auth.uid()))
      or (type = 'promote' and status = 'pending_payment' and not is_business_approved(auth.uid()))
    )
  );

-- No update/delete policy for the owner — status transitions (review
-- approval, payment activation, pausing) are exclusively admin- or
-- webhook-driven (Milestone 7 / Phase 2's Stripe webhook), both via the
-- service-role client. Explicit revoke too, same defense-in-depth posture
-- 20260806130000_lock_down_videos_update.sql settled on after this exact
-- assumption ("RLS with no policy is enough") already needed a second pass
-- once this alpha.
revoke update, delete on table campaigns from authenticated, anon, public;
