-- FRAME — closed-alpha invite gate
--
-- Nothing in the app is reachable without a valid invite code (public share
-- links are the one deliberate exception — see InviteGate.tsx, they're
-- designed to work for people who aren't on FRAME at all). invite_codes has
-- zero RLS policies granting client access on purpose: it's only ever read
-- or written by service-role Route Handlers (/api/invite/validate,
-- /api/invite/redeem), never queried directly from the browser.

create table invite_codes (
  code text primary key,
  max_uses integer not null default 1,
  uses_count integer not null default 0,
  note text,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

alter table invite_codes enable row level security;

alter table profiles add column invite_redeemed_at timestamptz;

-- Atomic consume — a plain PostgREST update can't express "uses_count <
-- max_uses" as a single-round-trip, race-safe check (that's a column-to-
-- column comparison, not column-to-literal), so this is a function instead.
-- Returns whether the redemption actually happened.
create function redeem_invite_code(p_code text) returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  did_update boolean;
begin
  update invite_codes
  set uses_count = uses_count + 1
  where code = p_code
    and uses_count < max_uses
    and (expires_at is null or expires_at > now())
  returning true into did_update;
  return coalesce(did_update, false);
end;
$$;
