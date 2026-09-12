-- FRAME — real notifications backend, replacing the Inbox's mock data
-- (src/lib/mock-data.ts's notificationSummary/dmThreads). This is also the
-- concrete feature that satisfies Apple App Store Review Guideline 4.2
-- ("Minimum Functionality") once the app is wrapped for iOS — real push
-- notifications, not a bare WebView.
--
-- Writes only ever happen via the security-definer trigger functions in
-- 20260912020000_notification_triggers.sql, or the mark_notification_read
-- RPC in 20260912030000 — never a direct client insert/update, even though
-- RLS-default-deny would already block it. Same defense-in-depth posture as
-- ad_impressions/watch_sessions.

create type notification_type as enum ('like', 'comment', 'follow', 'mention', 'system');

create table notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references profiles (id) on delete cascade,
  -- null for a 'system' notification, which has no actor.
  actor_id uuid references profiles (id) on delete set null,
  type notification_type not null,
  video_id uuid references videos (id) on delete cascade,
  comment_id uuid references comments (id) on delete cascade,
  read boolean not null default false,
  -- Set once the Milestone 3 APNs dispatch batch has actually sent this as a
  -- native push. Null forever for anyone with no registered device_tokens
  -- row, which is expected and fine — the in-app Inbox list works regardless.
  pushed_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_recipient_created_at_idx on notifications (recipient_id, created_at desc);
create index notifications_undispatched_idx on notifications (created_at) where pushed_at is null;

alter table notifications enable row level security;

create policy notifications_select_own on notifications
  for select
  using (recipient_id = auth.uid());

revoke insert, update, delete on table notifications from authenticated, anon, public;

-- Powers the Inbox's live badge/list update (useNotificationsRealtime.ts) via
-- Postgres Changes — the first use of that Realtime mechanism in this repo
-- (Watch Parties use Broadcast/Presence instead, see
-- 20260808050000_watch_room_realtime_rls.sql). Postgres Changes evaluates
-- this table's own RLS for the connecting role, so notifications_select_own
-- above is what actually scopes delivery to the recipient — no separate
-- realtime.messages policy is needed here.
alter publication supabase_realtime add table notifications;
