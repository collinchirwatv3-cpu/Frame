-- FRAME — Parties: a real, browsable list of watch-together sessions.
--
-- Watch Together itself has zero persistence today (src/lib/use-watch-room.ts):
-- a "room" is purely an ephemeral Supabase Realtime channel keyed by a
-- client-generated UUID, with Presence as the only "who's here" data —
-- there has never been a way to discover a room without already having its
-- link. This table is that missing piece, for the new "Parties" nav tab
-- specifically — the existing instant/unlisted "Watch together" button on a
-- video (VideoOptionsSheet.tsx) is deliberately left untouched and keeps
-- working exactly as it does today, writing nothing here.
--
-- `id` doubles as the room id — creating a party inserts a row here, then
-- routes straight to /watch-together/<id>?v=<video_id>, reusing the existing
-- `watch-room:${roomId}` Realtime channel key as-is. No changes needed to
-- use-watch-room.ts or the player route.
--
-- Security posture, stated explicitly since it's a real product decision,
-- not an oversight: `watch_parties_select_all` makes every party's title,
-- host, and video fully public to anyone (including signed-out visitors) —
-- confirmed intentional, matching the reference "browse and join any party"
-- lobby design. This is a genuine shift from Watch Together's existing
-- link-only trust model, scoped to *this* table only.
create table watch_parties (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  video_id uuid references videos (id) on delete set null,
  created_at timestamptz not null default now()
);

create index watch_parties_created_at_idx on watch_parties (created_at desc);
create index watch_parties_host_id_idx on watch_parties (host_id);

alter table watch_parties enable row level security;

create policy watch_parties_select_all on watch_parties
  for select using (true);

create policy watch_parties_insert_own on watch_parties
  for insert with check (auth.uid() = host_id);

create policy watch_parties_update_own on watch_parties
  for update using (auth.uid() = host_id);

create policy watch_parties_delete_own on watch_parties
  for delete using (auth.uid() = host_id);
