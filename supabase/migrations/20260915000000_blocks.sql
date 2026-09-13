-- FRAME — Blocking. Full block, per product decision: a block force-ends
-- any existing follow relationship (both directions), prevents either side
-- from re-following the other, and hides each side's profile and Frames
-- from the other via RLS — not just a client-side filter.
--
-- blocks_select_own deliberately does NOT let the blocked party read the
-- row: only the blocker can see who they've blocked (to manage/unblock
-- them from Settings). This matches the common product norm of never
-- confirming to someone that they've been blocked.
create table blocks (
  blocker_id uuid not null references profiles (id) on delete cascade,
  blocked_id uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint no_self_block check (blocker_id <> blocked_id)
);

create index blocks_blocked_id_idx on blocks (blocked_id);

alter table blocks enable row level security;

create policy blocks_select_own on blocks for select using (auth.uid() = blocker_id);
create policy blocks_insert_own on blocks for insert
  with check (auth.uid() = blocker_id and is_invited(auth.uid()));
create policy blocks_delete_own on blocks for delete using (auth.uid() = blocker_id);

-- security definer: every policy below calls this to check a pair
-- regardless of which direction blocked the other, but blocks_select_own
-- only lets each user read rows where THEY are the blocker — this function
-- has to see across that boundary to be usable inside another table's
-- policy at all. Returns false whenever either id is null (a signed-out
-- viewer has auth.uid() = null), so anonymous browsing is unaffected.
create function is_blocked_pair(a uuid, b uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from blocks
    where (blocker_id = a and blocked_id = b)
       or (blocker_id = b and blocked_id = a)
  );
$$;

-- profiles_select_all's `using (true)` becomes the same, minus a blocked
-- pair. `id = auth.uid()` first so viewing your own row is never affected
-- by is_blocked_pair(auth.uid(), auth.uid()) (always false anyway, since
-- self-blocks are rejected by the check constraint, but explicit is cheap
-- and matches this schema's existing style of not relying on that).
drop policy profiles_select_all on profiles;
create policy profiles_select_all on profiles for select
  using (id = auth.uid() or not is_blocked_pair(auth.uid(), id));

-- videos_select_public (20260805000000_upload_pipeline.sql) gains the same
-- exclusion — defense in depth, not reliance on the profiles embed coming
-- back null: without this, the video row's own columns (title, poster,
-- description) are still selectable by a blocked pair even though the
-- creator embed alone would resolve to null.
drop policy videos_select_public on videos;
create policy videos_select_public on videos for select
  using (
    ((visibility = 'public' and processing_status = 'ready') or creator_id = auth.uid())
    and not is_blocked_pair(auth.uid(), creator_id)
  );

-- A blocked pair can't re-follow each other going forward. Existing follow
-- rows between them are force-deleted by /api/block at block time (that
-- direction isn't the acting user's own row under follows_delete_own, so
-- it has to go through a service-role write there, not RLS).
alter policy follows_insert_own on follows
  with check (auth.uid() = follower_id and is_invited(auth.uid()) and not is_blocked_pair(follower_id, followee_id));
