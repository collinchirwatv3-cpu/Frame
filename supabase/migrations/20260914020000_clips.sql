-- FRAME — Clip: a pure engagement/discovery feature, deliberately with NO
-- revenue/attribution tie-in (the ad_impressions/revenue_ledger machinery a
-- clip could plug into doesn't exist anywhere in this codebase). A clip is
-- a virtual (start_seconds, end_seconds) pointer into the ORIGINAL video's
-- existing Cloudflare Stream asset — no re-encoding, no new Stream asset,
-- no cloudflare-stream.ts changes needed at all.
--
-- Schema/RLS modeled directly on comments (20260101000000_init.sql) — same
-- ownership/visibility shape, since a clip is conceptually "another piece
-- of user content pointing at a video," same as a comment.
create table clips (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references videos (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  start_seconds numeric not null check (start_seconds >= 0),
  end_seconds numeric not null,
  title text,
  created_at timestamptz not null default now(),
  constraint clips_end_after_start check (end_seconds > start_seconds),
  constraint clips_max_length check (end_seconds - start_seconds <= 120)
);

create index clips_video_id_created_at_idx on clips (video_id, created_at);

alter table clips enable row level security;

create policy clips_select_visible on clips for select
  using (
    exists (
      select 1 from videos
      where videos.id = clips.video_id
        and (videos.visibility = 'public' or videos.creator_id = auth.uid())
    )
  );

create policy clips_insert_own on clips for insert with check (auth.uid() = user_id);

create policy clips_delete_own_or_video_owner on clips for delete
  using (
    auth.uid() = user_id
    or exists (select 1 from videos where videos.id = clips.video_id and videos.creator_id = auth.uid())
  );
