-- FRAME — Watch Party visibility + scheduling. "Private" here means hidden
-- from browse/discovery lists only, NOT real access control — no
-- membership/RSVP system exists or is being built. The existing Realtime
-- Authorization boundary (can_access_watch_room in
-- 20260808050000_watch_room_realtime_rls.sql: any is_invited() FRAME member
-- may join/fully manipulate ANY listed party via its link, public or
-- private) is completely unchanged by this migration. A confirmed,
-- deliberate scope boundary — see the plan file.
--
-- scheduled_at/repeat_rule are real, not decorative — a dispatch job
-- (20260913020000/030000 + the notify-scheduled route) actually fires a
-- notification off them. last_notified_at is that job's idempotency marker:
-- null means "never notified" (fires once scheduled_at arrives); for a
-- repeating party, re-fires once the relevant interval has elapsed since
-- this timestamp. Recurrence here means the REMINDER repeats, not the
-- session — nothing auto-creates new party rows or auto-opens a room.
create type party_visibility as enum ('public', 'private');
create type party_repeat_rule as enum ('none', 'daily', 'weekly');

alter table watch_parties
  add column visibility party_visibility not null default 'public',
  add column scheduled_at timestamptz,
  add column repeat_rule party_repeat_rule not null default 'none',
  add column last_notified_at timestamptz;

-- Replaces watch_parties_select_all's `using (true)`. is_invited(auth.uid())
-- is included deliberately — this SELECT policy must not be *stricter* than
-- can_access_watch_room's existing "any invited member may reach any listed
-- party" boundary, which this migration does not touch. Net effect:
-- signed-out/uninvited callers see public parties only; any invited member
-- can still read any row directly by id (matches today's real access
-- model, unchanged); the public/followed-only *browse listing* behavior is
-- enforced by explicit .eq("visibility", "public") filters in
-- watch-parties.ts, not by hiding rows at this layer.
drop policy watch_parties_select_all on watch_parties;

create policy watch_parties_select_visible on watch_parties
  for select using (
    visibility = 'public'
    or host_id = auth.uid()
    or is_invited(auth.uid())
  );
