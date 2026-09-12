-- FRAME — device push-token registry. Unused until the Milestone 3 App Store
-- work (Capacitor's Push Notifications plugin PUTs a real APNs token here
-- once the app is wrapped natively) — created now, alongside notifications,
-- since it's part of the same schema story and inert until then, the same
-- way stripe_payment_intent_id/premieres shipped ahead of their own feature.
create table device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android', 'web')),
  token text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, token)
);

alter table device_tokens enable row level security;

-- Unlike notifications, this one IS legitimately client-writable — a device
-- registering or removing its own push token is a normal, non-privileged
-- action, not a state transition that needs a security-definer gate.
create policy device_tokens_own on device_tokens
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
