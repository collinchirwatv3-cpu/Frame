-- FRAME — close the invite-gate bypass at the actual security boundary.
--
-- The invite gate (InviteGate.tsx) has only ever been a client-side check:
-- it reads a Zustand store persisted to localStorage under key
-- "frame-invite" — setting that key to ANY non-empty string via DevTools
-- satisfies it, with zero server round-trip. Nothing downstream (the OAuth
-- callback, any Route Handler, any RLS policy) has ever checked
-- profiles.invite_redeemed_at before now. A signed-in-but-uninvited session
-- has always been able to fully read/write app data — the client UI was a
-- speed bump, not a boundary.
--
-- Fixing this at RLS rather than trying to hard-block signup itself:
-- Google/Apple OAuth accounts are created by Supabase Auth as an inherent
-- part of the provider code-exchange (raw_user_meta_data is populated by
-- the provider, not client-injectable the way email/magic-link's
-- options.data is) — there's no clean way to abort that transaction from
-- our side for OAuth specifically. Instead: the account can exist, but
-- stays completely inert (can't write anything) until a real, server-
-- verified invite redemption sets invite_redeemed_at. Uniform across every
-- auth method, doesn't depend on OAuth-provider metadata quirks.
--
-- SELECT policies are deliberately untouched — signed-out/uninvited
-- browsing of public content (Discover, Search, /watch/[id], etc.) keeps
-- working exactly as today. This only closes the "uninvited account can
-- act" gap, not "uninvited visitor can look."
create function is_invited(uid uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from profiles where id = uid and invite_redeemed_at is not null
  );
$$;

alter policy videos_insert_own on videos
  with check (creator_id = auth.uid() and is_invited(auth.uid()));

alter policy comments_insert_own on comments
  with check (auth.uid() = user_id and is_invited(auth.uid()));

alter policy likes_insert_own on likes
  with check (auth.uid() = user_id and is_invited(auth.uid()));

alter policy saves_insert_own on saves
  with check (auth.uid() = user_id and is_invited(auth.uid()));

alter policy follows_insert_own on follows
  with check (auth.uid() = follower_id and is_invited(auth.uid()));

alter policy watch_parties_insert_own on watch_parties
  with check (auth.uid() = host_id and is_invited(auth.uid()));
