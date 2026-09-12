-- FRAME — Monetization, Milestone 1b: Business Channels. Verified business
-- accounts that can later "Run as an Ad" (base CPM, dynamic) but can never
-- Promote — Promote is a creator-only growth tool, per the monetization
-- model's own explicit rule that advertising must never be able to
-- masquerade as organic creator content.
--
-- Applying is a real client-facing action (insert own row), but approving
-- one is not — same posture as is_moderator/monetization_eligible: no
-- owner UPDATE policy exists at all, status only ever moves via the
-- Milestone 7 admin route (service-role, re-checks is_moderator itself,
-- mirrors /api/moderation/reports/[reportId]/route.ts exactly).
create type business_channel_status as enum ('pending', 'approved', 'rejected');

create table business_channels (
  profile_id uuid primary key references profiles (id) on delete cascade,
  legal_name text not null check (char_length(legal_name) between 1 and 120),
  status business_channel_status not null default 'pending',
  applied_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references profiles (id),
  rejection_reason text
);

alter table business_channels enable row level security;

-- Owner can see their own application's status; a moderator can see every
-- pending application to review it — same read-only moderator-visibility
-- pattern as videos_select_moderators
-- (20260806140000_moderator_video_visibility.sql). No write access for
-- moderators here either; that goes through the service-role admin route.
create policy business_channels_select_own_or_moderator on business_channels
  for select using (
    profile_id = auth.uid()
    or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_moderator)
  );

-- with check forces every client-created row to start 'pending' — a
-- self-approval attempt (status = 'approved' in the same insert) is
-- rejected at the data layer, not just hidden in the UI.
create policy business_channels_insert_own on business_channels
  for insert with check (profile_id = auth.uid() and status = 'pending');

-- Deliberately no update/delete policy for the owner — approving,
-- rejecting, or revoking a Business Channel is an admin-only action
-- (Milestone 7), via the service-role client, same as is_moderator itself
-- having no client-facing grant flow. Explicit revoke on top, same
-- defense-in-depth posture as every other table in this feature.
revoke update, delete on table business_channels from authenticated, anon, public;

create function is_business_approved(uid uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from business_channels where profile_id = uid and status = 'approved'
  );
$$;

-- Structural enforcement: an approved Business Channel's insert with
-- publish_mode = 'promote' is rejected at the database layer. Replaces the
-- whole WITH CHECK clause again (alter policy doesn't append) — carries
-- forward every condition from 20260808060000 unchanged, adds the new one.
alter policy videos_insert_own on videos
  with check (
    creator_id = auth.uid()
    and is_invited(auth.uid())
    and (publish_mode <> 'monetise' or is_monetization_eligible(auth.uid()))
    and (publish_mode <> 'promote' or not is_business_approved(auth.uid()))
  );
