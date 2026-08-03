-- FRAME — initial production schema
--
-- Generated as part of the prototype-to-production migration plan
-- (see /MIGRATION_PLAN.md). Supersedes the schema previously documented as
-- prose in README.md § Data model — this is the real, applyable version.
--
-- Apply with the Supabase CLI: `supabase db push` (or `supabase migration up`
-- locally). Filename follows the CLI's `<timestamp>_<name>.sql` convention so
-- it drops directly into `supabase/migrations/` without renaming.
--
-- Design principles carried over from the client-side architecture:
--   * width/height are the source of truth for aspect ratio — never store a
--     derived "aspect_ratio" label column (mirrors lib/badges.ts and
--     lib/aspect-ratio.ts client-side: derive, don't duplicate).
--   * Engagement counters (likes_count, followers_count, etc.) are
--     denormalized and trigger-maintained for fast reads at 1M-MAU read
--     volume — never COUNT(*) a join table on every feed render.
--   * quality_score is computed and stored for server-side ranking, but must
--     NEVER be selected into any client-facing API response or view — the
--     product spec is explicit that the Quality Index is never exposed raw.
--   * Private-video access via a share-link token is NOT an RLS concern —
--     anonymous token holders have no auth.uid(). That path is handled by a
--     Route Handler using the service-role key after validating the token and
--     its expiry in application code (see /watch and /s/[token] in the app).

-- ============================================================================
-- Extensions
-- ============================================================================
create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- ============================================================================
-- Enums
-- ============================================================================
create type category as enum (
  'Travel', 'Cars', 'Architecture', 'Gaming', 'Music', 'Technology',
  'Sports', 'Short Films', 'Documentaries', 'Nature'
);

create type video_visibility as enum ('public', 'private');

create type share_link_ttl as enum ('1h', '24h', '7d');

create type report_reason as enum ('spam', 'csam', 'harassment', 'copyright', 'other');

create type report_status as enum ('pending', 'reviewed', 'actioned', 'dismissed');

-- ============================================================================
-- profiles — one row per auth.users row, created by trigger on signup
-- ============================================================================
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  display_name text not null,
  avatar_url text,
  banner_url text,
  bio text not null default '',
  website text,
  verified boolean not null default false,
  statement text,
  equipment text[],
  available_for_hire boolean not null default false,
  interests category[] not null default '{}',
  is_moderator boolean not null default false,
  -- Denormalized, trigger-maintained — see maintain_follow_counts() below.
  followers_count integer not null default 0,
  following_count integer not null default 0,
  total_views bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_username_idx on profiles (username);

-- Auto-create a profile row the moment someone signs up via Supabase Auth.
create function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'username', 'user_' || substr(new.id::text, 1, 8)),
    coalesce(new.raw_user_meta_data ->> 'display_name', 'New Creator')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================================================
-- videos
-- ============================================================================
create table videos (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references profiles (id) on delete cascade,
  playback_url text not null,
  poster_url text not null,
  title text not null,
  description text not null default '',
  category category not null,
  sound_name text,
  duration_seconds numeric not null,
  -- Source of truth for aspect ratio — see lib/aspect-ratio.ts client-side.
  width integer not null,
  height integer not null,
  visibility video_visibility not null default 'public',
  -- Editorial/equipment badges only (Drone, Shot on RED, FRAME Certified from
  -- curation). Computed badges (4K, 21:9 Cinema, score-driven FRAME Certified)
  -- stay derived client- and server-side — never written here redundantly.
  badges text[] not null default '{}',
  -- Optional, creator-controlled shooting details (camera/lens/fps/codec/
  -- location/creatorNotes/behindTheScenes/equipment/tags) — flexible bag,
  -- matches VideoDetails in lib/types.ts.
  details jsonb,
  -- FRAME Quality Index (lib/quality.ts) — server-side ranking input only.
  -- MUST NOT appear in any client-facing SELECT/view. Enforced by convention
  -- + code review, not by RLS (RLS restricts rows, not columns) — see
  -- MIGRATION_PLAN.md § Security for the enforcement note.
  quality_score numeric,
  likes_count integer not null default 0,
  comments_count integer not null default 0,
  shares_count integer not null default 0,
  saves_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index videos_creator_id_idx on videos (creator_id);
create index videos_category_idx on videos (category);
-- The hot path: "public videos, newest first" — covers the feed and Explore.
create index videos_visibility_created_at_idx on videos (visibility, created_at desc);
create index videos_badges_gin_idx on videos using gin (badges);

-- ============================================================================
-- follows / likes / saves — composite-PK join tables, no surrogate id needed
-- ============================================================================
create table follows (
  follower_id uuid not null references profiles (id) on delete cascade,
  followee_id uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  constraint no_self_follow check (follower_id <> followee_id)
);

create index follows_followee_id_idx on follows (followee_id);

create table likes (
  user_id uuid not null references profiles (id) on delete cascade,
  video_id uuid not null references videos (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, video_id)
);

create index likes_video_id_idx on likes (video_id);

create table saves (
  user_id uuid not null references profiles (id) on delete cascade,
  video_id uuid not null references videos (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, video_id)
);

create index saves_video_id_idx on saves (video_id);

-- ============================================================================
-- comments
-- ============================================================================
create table comments (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references videos (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  text text not null check (char_length(text) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index comments_video_id_created_at_idx on comments (video_id, created_at);

-- ============================================================================
-- watch_progress — private per user, powers cross-device resume (Phase 4)
-- ============================================================================
create table watch_progress (
  user_id uuid not null references profiles (id) on delete cascade,
  video_id uuid not null references videos (id) on delete cascade,
  position_seconds numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, video_id)
);

-- ============================================================================
-- share_links — token-gated private-video access (see lib/share-links.ts)
-- ============================================================================
create table share_links (
  token text primary key,
  video_id uuid not null references videos (id) on delete cascade,
  creator_id uuid not null references profiles (id) on delete cascade,
  ttl share_link_ttl not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  view_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index share_links_video_id_idx on share_links (video_id);

-- ============================================================================
-- collections — platform-curated, not creator-owned (see lib/mock-data.ts)
-- ============================================================================
create table collections (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  cover_url text not null,
  created_at timestamptz not null default now()
);

create table collection_videos (
  collection_id uuid not null references collections (id) on delete cascade,
  video_id uuid not null references videos (id) on delete cascade,
  position integer not null default 0,
  primary key (collection_id, video_id)
);

create index collection_videos_video_id_idx on collection_videos (video_id);

create table saved_collections (
  user_id uuid not null references profiles (id) on delete cascade,
  collection_id uuid not null references collections (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, collection_id)
);

-- ============================================================================
-- reports — moderation. INSERT-only for regular users; review is
-- moderator-only. See MIGRATION_PLAN.md § Moderation for the review-queue
-- and CSAM-reporting integration this table feeds into.
-- ============================================================================
create table reports (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references videos (id) on delete cascade,
  reporter_id uuid not null references profiles (id) on delete cascade,
  reason report_reason not null,
  detail text,
  status report_status not null default 'pending',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references profiles (id)
);

create index reports_status_idx on reports (status);
create index reports_video_id_idx on reports (video_id);

-- ============================================================================
-- premieres — ARCHITECTURE ONLY. No application code reads or writes these
-- tables yet (see lib/types.ts `Premiere` — built as a type, not a feature,
-- per an explicit "architecture only, no fake backend" product decision).
-- Included here so the schema exists ahead of the feature shipping, not
-- retrofitted later. Safe to leave unused; RLS still applied defensively.
-- ============================================================================
create table premieres (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references videos (id) on delete cascade,
  creator_id uuid not null references profiles (id) on delete cascade,
  scheduled_for timestamptz not null,
  chat_opens_at timestamptz not null,
  chat_closes_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table premiere_reminders (
  premiere_id uuid not null references premieres (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (premiere_id, user_id)
);

-- ============================================================================
-- Denormalized counter maintenance — triggers, not application code, so
-- counts stay correct regardless of which code path mutates the join tables.
-- ============================================================================
create function adjust_video_counter(video uuid, column_name text, delta integer)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  execute format('update videos set %I = greatest(0, %I + $1) where id = $2', column_name, column_name)
    using delta, video;
end;
$$;

create function on_like_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform adjust_video_counter(new.video_id, 'likes_count', 1);
  elsif tg_op = 'DELETE' then
    perform adjust_video_counter(old.video_id, 'likes_count', -1);
  end if;
  return null;
end;
$$;

create trigger likes_count_trigger
  after insert or delete on likes
  for each row execute function on_like_change();

create function on_save_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform adjust_video_counter(new.video_id, 'saves_count', 1);
  elsif tg_op = 'DELETE' then
    perform adjust_video_counter(old.video_id, 'saves_count', -1);
  end if;
  return null;
end;
$$;

create trigger saves_count_trigger
  after insert or delete on saves
  for each row execute function on_save_change();

create function on_comment_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform adjust_video_counter(new.video_id, 'comments_count', 1);
  elsif tg_op = 'DELETE' then
    perform adjust_video_counter(old.video_id, 'comments_count', -1);
  end if;
  return null;
end;
$$;

create trigger comments_count_trigger
  after insert or delete on comments
  for each row execute function on_comment_change();

create function on_follow_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update profiles set following_count = following_count + 1 where id = new.follower_id;
    update profiles set followers_count = followers_count + 1 where id = new.followee_id;
  elsif tg_op = 'DELETE' then
    update profiles set following_count = greatest(0, following_count - 1) where id = old.follower_id;
    update profiles set followers_count = greatest(0, followers_count - 1) where id = old.followee_id;
  end if;
  return null;
end;
$$;

create trigger follow_counts_trigger
  after insert or delete on follows
  for each row execute function on_follow_change();

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table profiles enable row level security;
alter table videos enable row level security;
alter table follows enable row level security;
alter table likes enable row level security;
alter table saves enable row level security;
alter table comments enable row level security;
alter table watch_progress enable row level security;
alter table share_links enable row level security;
alter table collections enable row level security;
alter table collection_videos enable row level security;
alter table saved_collections enable row level security;
alter table reports enable row level security;
alter table premieres enable row level security;
alter table premiere_reminders enable row level security;

-- profiles: public read, owner-only write
create policy profiles_select_all on profiles for select using (true);
create policy profiles_update_own on profiles for update using (auth.uid() = id);

-- videos: public videos readable by anyone; private videos readable only by
-- their owner via normal RLS. (Anonymous share-token access is handled by a
-- service-role Route Handler, not by a policy here — see header comment.)
create policy videos_select_public on videos for select
  using (visibility = 'public' or creator_id = auth.uid());
create policy videos_insert_own on videos for insert with check (creator_id = auth.uid());
create policy videos_update_own on videos for update using (creator_id = auth.uid());
create policy videos_delete_own on videos for delete using (creator_id = auth.uid());

-- follows / likes / saves: readable by anyone (public engagement signals),
-- writable only by the acting user.
create policy follows_select_all on follows for select using (true);
create policy follows_insert_own on follows for insert with check (auth.uid() = follower_id);
create policy follows_delete_own on follows for delete using (auth.uid() = follower_id);

create policy likes_select_all on likes for select using (true);
create policy likes_insert_own on likes for insert with check (auth.uid() = user_id);
create policy likes_delete_own on likes for delete using (auth.uid() = user_id);

create policy saves_select_own on saves for select using (auth.uid() = user_id);
create policy saves_insert_own on saves for insert with check (auth.uid() = user_id);
create policy saves_delete_own on saves for delete using (auth.uid() = user_id);

-- comments: readable if the underlying video is visible to the reader;
-- insertable by the authenticated commenter; deletable by the comment's
-- author OR the video's owner (basic creator-side moderation).
create policy comments_select_visible on comments for select
  using (
    exists (
      select 1 from videos
      where videos.id = comments.video_id
        and (videos.visibility = 'public' or videos.creator_id = auth.uid())
    )
  );
create policy comments_insert_own on comments for insert with check (auth.uid() = user_id);
create policy comments_delete_own_or_video_owner on comments for delete
  using (
    auth.uid() = user_id
    or exists (select 1 from videos where videos.id = comments.video_id and videos.creator_id = auth.uid())
  );

-- watch_progress: fully private
create policy watch_progress_own on watch_progress for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- share_links: only the creator who made the link can read/manage it via the
-- client; token resolution for viewers goes through a service-role route.
create policy share_links_owner_only on share_links for all
  using (auth.uid() = creator_id) with check (auth.uid() = creator_id);

-- collections: public read-only; writes are admin/service-role only (no
-- policy granted to `authenticated`/`anon` for insert/update/delete).
create policy collections_select_all on collections for select using (true);
create policy collection_videos_select_all on collection_videos for select using (true);

create policy saved_collections_own on saved_collections for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- reports: any authenticated user can file one; only moderators can read/
-- update the queue.
create policy reports_insert_own on reports for insert with check (auth.uid() = reporter_id);
create policy reports_select_moderators on reports for select
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_moderator));
create policy reports_update_moderators on reports for update
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_moderator));

-- premieres: schema-only for now — public read, owner write, matching the
-- eventual intended shape, so no migration is needed the day the feature ships.
create policy premieres_select_all on premieres for select using (true);
create policy premieres_owner_write on premieres for all
  using (auth.uid() = creator_id) with check (auth.uid() = creator_id);
create policy premiere_reminders_own on premiere_reminders for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
