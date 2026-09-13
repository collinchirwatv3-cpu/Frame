-- FRAME — new notification_type value for the scheduled-party dispatch job
-- (20260913030000_party_notifications.sql, notify-scheduled route). Enum
-- value additions can't share a transaction with other DDL on the same
-- type, so this is its own migration — same restriction already documented
-- for the monetization migrations' clip-attribution enum additions.
alter type notification_type add value 'party_starting';
