-- FRAME — Monetization, Milestone 1d: watch_sessions. The genuine
-- watch-time event log the ads system needs and nothing existing today
-- provides: watch_progress (20260101000000_init.sql) is a single upserted
-- last-position-in-seconds row per (user, video) — overwritten on every
-- watch, no cumulative time, no session history, no distinction between a
-- video watched to completion and one abandoned at 3 seconds. That's fine
-- for its own job (cross-device resume), but cannot answer "how much
-- verified watch time did this creator's content get," which the Shorts
-- creator-pool formula (Milestone 4) is built on.
--
-- The single most important property of this table, spelled out because
-- everything downstream depends on it: campaign_id is non-null ONLY for a
-- session that began via a traceable paid click-through (cross-checked
-- against a real ad_impressions row server-side in the watch-sessions
-- start route, Milestone 3 — never taken as a bare client claim). Every
-- revenue/eligibility calculation in this feature reads exclusively from
-- organic_watch_sessions below, never this raw table directly — that's the
-- entire mechanism behind "paid impressions never count toward
-- monetization revenue or eligibility," enforced structurally in one place
-- rather than as an application-layer check a future PR could forget.
create table watch_sessions (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references videos (id) on delete cascade,
  -- Signed-in viewer, or null for a signed-out one — watching has always
  -- been open to signed-out visitors in this app (Discover, /watch/[id]),
  -- and that's deliberately unchanged here; only writes to content ever
  -- required an invite, never reads/views.
  viewer_id uuid references profiles (id) on delete set null,
  -- Server-issued only (minted by the watch-sessions start route,
  -- Milestone 3) — never client-chosen, so it can't be reused to fake
  -- distinct "unique viewers" for the pool-share unique-viewer weighting.
  anon_id text,
  -- Proves ownership of THIS session for the heartbeat call (Milestone 3's
  -- record_watch_heartbeat) without needing viewer_id to be set — works
  -- for signed-out sessions too.
  client_session_token uuid not null default gen_random_uuid(),
  campaign_id uuid references campaigns (id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  watched_seconds numeric not null default 0 check (watched_seconds >= 0),
  max_position_seconds numeric not null default 0 check (max_position_seconds >= 0),
  created_at timestamptz not null default now()
);

create index watch_sessions_video_id_idx on watch_sessions (video_id);
create index watch_sessions_campaign_id_idx on watch_sessions (campaign_id);

-- The one sanctioned read path for every downstream revenue/eligibility
-- query (Milestone 4 onward) — see the module comment above. There is
-- exactly one place in this entire schema where "campaign_id is null"
-- (organic) is written; every calculation is required to select from this
-- view, never from watch_sessions directly.
--
-- Not client-queryable, deliberately: views run with the privileges of
-- their owner for relation access (the role applying this migration,
-- effectively BYPASSRLS), and Postgres' documented RLS/view interaction
-- for that exact combination is murky enough that this revokes SELECT
-- outright rather than trust it — this view exists only to be read from
-- inside the Milestone 4 security-definer calculation functions (which
-- need to see every user's organic sessions to compute the pool, and
-- already run with elevated privileges by design), never queried directly
-- by a client role.
create view organic_watch_sessions as
  select * from watch_sessions where campaign_id is null;

revoke select on organic_watch_sessions from authenticated, anon, public;

alter table watch_sessions enable row level security;

-- Own rows only, signed-in viewers only — an anon session's rows aren't
-- individually readable by anyone client-side (they're still writable at
-- insert, and readable by the service-role calculation functions), since
-- there's no credential an anonymous request could present to prove "this
-- anon_id is mine" the way client_session_token does for the heartbeat
-- write path specifically.
create policy watch_sessions_select_own on watch_sessions
  for select using (viewer_id = auth.uid());

-- Client can create a session's *start* only — viewer_id must be the
-- caller or null (signed-out). watched_seconds/max_position_seconds stay
-- at their zero defaults here; only Milestone 3's record_watch_heartbeat
-- (security definer, validates client_session_token, clamps the claimed
-- delta server-side) can ever advance them — never a client UPDATE.
create policy watch_sessions_insert on watch_sessions
  for insert with check (viewer_id = auth.uid() or viewer_id is null);

-- No update/delete policy for any client role, and an explicit revoke on
-- top — same defense-in-depth posture as campaigns/videos: this table's
-- entire value is that watched_seconds can only move through one clamped,
-- token-checked function, never a raw client PATCH.
revoke update, delete on table watch_sessions from authenticated, anon, public;
