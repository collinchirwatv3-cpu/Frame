-- FRAME — Monetization, Milestone 1a: content publish mode + creator/
-- Premium eligibility flags. Pure additive schema — nothing in the app
-- reads or writes any of this yet, so this migration is a zero-behavior-
-- change ship, safe to verify in isolation before any UI exists.
--
-- Scope note: this is Phase 1 of the monetization system (data model +
-- eligibility gating + revenue accrual). No payment processor exists in
-- this project — Premium/campaign spend cannot actually be charged, and
-- ledger balances (see the later revenue_ledger migration) cannot actually
-- be paid out, until Stripe is wired in as Phase 2. `premium_status` can
-- only ever reach 'pending_checkout' in Phase 1; nothing here can advance
-- it further without a real Stripe webhook.
--
-- `publish_mode` on videos: Post (free, default) / Promote (creator pays to
-- boost visibility) / Monetise (eligible creators only, ads run inside
-- their long-form video). videos already has table-level UPDATE fully
-- revoked from every client role (20260806130000_lock_down_videos_update.sql)
-- — publish_mode is therefore only ever settable at insert time, with no
-- later client path to flip it. That's exactly the property we want here;
-- it falls out for free from the existing lockdown.
create type video_publish_mode as enum ('post', 'promote', 'monetise');

alter table videos
  add column publish_mode video_publish_mode not null default 'post';

-- monetization_eligible/premium_status are new profiles columns. They are
-- deliberately NOT added to the existing client-facing column grant
-- (20260808000000_profile_self_edit.sql granted UPDATE on exactly
-- username/display_name/bio/website/avatar_url/banner_url to authenticated,
-- after blanket UPDATE was revoked) — these stay unreachable by any direct
-- client write, same as is_moderator/verified already are. State changes
-- come only from a service-role admin route (Milestone 7) or, for
-- premium_status, a future Stripe webhook (Phase 2).
alter table profiles
  add column monetization_eligible boolean not null default false,
  add column monetization_eligible_since timestamptz;

-- Named premium_subscription_status, not premium_status, so the type name
-- doesn't collide with the profiles.premium_status column below — legal in
-- Postgres either way (types and columns are different namespaces) but
-- confusing, and every other enum in this schema is entity-prefixed
-- (video_content_type, business_channel_status, campaign_status) — this
-- matches that convention instead of being the one exception.
create type premium_subscription_status as enum ('inactive', 'pending_checkout', 'active', 'canceled');

alter table profiles
  add column premium_status premium_subscription_status not null default 'inactive',
  add column premium_since timestamptz;

-- Same shape as is_invited() (20260808030000_invite_gate_rls.sql) — a
-- plain stable sql helper reading already-readable data, safe to leave at
-- its default PUBLIC EXECUTE grant since it exposes nothing beyond what a
-- profile row itself would.
create function is_monetization_eligible(uid uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from profiles where id = uid and monetization_eligible
  );
$$;

-- Structural enforcement, not an application-layer check: a non-eligible
-- creator's insert with publish_mode = 'monetise' is rejected at the
-- database layer, same pattern as the invite gate. Replaces the whole
-- WITH CHECK clause (alter policy doesn't append) — carries forward the
-- existing creator-ownership and invite-gate conditions unchanged.
alter policy videos_insert_own on videos
  with check (
    creator_id = auth.uid()
    and is_invited(auth.uid())
    and (publish_mode <> 'monetise' or is_monetization_eligible(auth.uid()))
  );
