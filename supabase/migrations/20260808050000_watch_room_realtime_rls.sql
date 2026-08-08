-- Watch Parties — server-enforced membership for LISTED parties, via
-- Supabase Realtime Authorization (private channels + RLS on
-- realtime.messages), not a client-side check. See use-watch-room.ts's own
-- doc comment for the full product rationale; summarized here since this is
-- the file that actually enforces it:
--
-- PRODUCT RULE: a Watch Party's queue is deliberately collaborative — ANY
-- member may add to or advance it, not just the host. Host-only
-- authorization was explicitly considered and rejected; do not reintroduce
-- it. The real boundary is membership, not host status.
--
-- "Member of a specific party" = an invited FRAME member (is_invited(),
-- same helper the invite gate uses), for a roomId that actually corresponds
-- to a listed party (a real row in watch_parties). This matches that
-- table's own existing, deliberate "browse and join any party" design —
-- there's no separate join/membership record; being an invited member is
-- itself sufficient to join or manipulate ANY listed party's queue. A
-- non-invited account and a fully unauthenticated connection collapse into
-- the same rejected case (is_invited(null) is already false), so this one
-- check covers both "authenticated" and "member" at once.
--
-- Deliberately scoped to LISTED parties only. The ad-hoc, unlisted "Watch
-- together" button (VideoOptionsSheet.tsx) generates its roomId purely
-- client-side and never writes a row anywhere for it — there is nothing in
-- the database to check membership against for those rooms, and changing
-- that would be a real product/architecture addition, not an authorization
-- fix. Those rooms keep today's unchanged, link-is-the-invite trust model:
-- can_access_watch_room() falls through to `true` for any topic that
-- doesn't match a real watch_parties row.
--
-- realtime.messages has no other private-channel feature on it today
-- (use-watch-room.ts is the only `.channel()` caller in the codebase) —
-- scoped to the "watch-room:" prefix anyway so a future, unrelated private
-- channel doesn't silently inherit this table's membership logic, or get
-- silently blocked by it, just because its topic happens to look like a
-- UUID.
create function can_access_watch_room(topic text)
returns boolean
language sql
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

-- realtime.messages already has RLS enabled by default — no ALTER TABLE
-- needed. `to public` (not `to authenticated`) is intentional: it's what
-- lets the unmatched-topic branch above stay open to anon connections too,
-- preserving ad-hoc rooms' existing behavior through the same policy rather
-- than forking use-watch-room.ts's channel setup per room type.
create policy watch_room_messages_select on realtime.messages
  for select
  to public
  using (
    realtime.messages.extension in ('broadcast', 'presence')
    and can_access_watch_room(realtime.topic())
  );

create policy watch_room_messages_insert on realtime.messages
  for insert
  to public
  with check (
    realtime.messages.extension in ('broadcast', 'presence')
    and can_access_watch_room(realtime.topic())
  );
