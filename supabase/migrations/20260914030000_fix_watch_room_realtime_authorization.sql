-- FRAME — CRITICAL FIX. can_access_watch_room() was `language sql stable`
-- (runs AS THE CALLER), so its own `exists (select 1 from watch_parties
-- where id::text = ...)` check was itself subject to watch_parties' RLS.
-- That was safe when written, because watch_parties_select_all was
-- `using (true)` — every listed party was visible to the exists check
-- regardless of caller. 20260913010000_watch_party_visibility_and_schedule.sql
-- replaced that with watch_parties_select_visible
-- (`visibility = 'public' or host_id = auth.uid() or is_invited(auth.uid())`),
-- which made a PRIVATE party invisible to an anonymous/uninvited caller —
-- so the `exists` check now returns false for exactly the rooms it most
-- needs to protect, falls through to the `else true` ad-hoc-room branch,
-- and grants access. Confirmed live: an anonymous client could actually
-- SUBSCRIBED to a private party's realtime-room channel before this fix.
--
-- Fix: security definer + set search_path = public, so the membership
-- lookup runs with the function owner's privileges and sees every listed
-- party regardless of the caller's own SELECT visibility — restoring the
-- original, intended behavior (a private party is exactly as invite-gated
-- as a public one; visibility only ever meant "shown in browse lists").
-- NOT revoking execute here, deliberately: this function is invoked FROM
-- INSIDE the realtime.messages RLS policies below, which run `to public` —
-- the querying role needs EXECUTE to have that policy check succeed at
-- all, exactly like is_invited()/is_business_approved() elsewhere in this
-- schema (security definer only changes what the function BODY can see,
-- never who's allowed to call it). Revoking execute here would not close
-- anything further; it would break realtime authorization for everyone.
create or replace function can_access_watch_room(topic text)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select case
    when topic not like 'watch-room:%' then false
    when exists (
      select 1 from watch_parties where id::text = split_part(topic, ':', 2)
    ) then is_invited(auth.uid())
    else true
  end;
$$;
