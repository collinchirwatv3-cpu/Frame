-- FRAME — lets a notification reference the watch party it's about
-- (party_starting, dispatched by /api/internal/parties/notify-scheduled).
-- No RLS/grant changes needed — notifications already has zero client
-- grants (20260912000000_notifications.sql); this is just a new nullable
-- column on an already-locked-down table.
alter table notifications
  add column party_id uuid references watch_parties (id) on delete cascade;
