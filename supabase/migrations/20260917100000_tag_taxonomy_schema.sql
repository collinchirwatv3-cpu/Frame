-- FRAME Tag Taxonomy — schema. See the "FRAMES TAG TAXONOMY" spec: a
-- hierarchical, database-driven tag system (content type, genre, mood,
-- location, and heavily-detailed gear down to specific manufacturer/model)
-- to replace the single hardcoded `videos.category` enum, which never had
-- the expandability this needs — proven by this schema's own history:
-- video_content_type (20260806120000_shorts_content_type.sql) needed a
-- follow-up `alter type ... add value` migration
-- (20260808040000_longform_content_type.sql) just to add "longform". A
-- native enum for tag categories would hit the exact same wall the first
-- time a new gear category is needed, so tag_categories below is a real
-- table instead — adding one is an INSERT, never a schema change.
create extension if not exists pg_trgm;

-- One row per taxonomy section (~37) — content_type/genre/topic/mood/
-- location/gear facets, each with a display tier (primary/secondary/
-- technical) matching the spec's own "Frame page" display example:
-- content type on its own line, genre+topic+mood+location grouped as
-- secondary, gear as a "Shot on:" technical block.
create table tag_categories (
  id text primary key,
  section_number integer not null,
  name text not null,
  tier text not null check (tier in ('primary', 'secondary', 'technical')),
  facet text not null check (facet in ('content_type', 'genre', 'topic', 'mood', 'location', 'gear'))
);

-- The taxonomy itself. Self-referential parent_tag_id covers two distinct
-- hierarchies: Location's Continent -> Country -> Region -> City ->
-- Specific Location chain, and gear's Manufacturer -> Model grouping
-- (e.g. "Sony" is the parent of "Sony FX3"). gear_details holds the
-- gear-only optional fields the spec asks for (mount/sensor format/
-- release year/discontinued/product family/related products) as a
-- flexible bag rather than a wide mostly-null table, same reasoning
-- videos.details already uses for optional per-video shooting info.
create table tags (
  id uuid primary key default gen_random_uuid(),
  category_id text not null references tag_categories (id),
  parent_tag_id uuid references tags (id) on delete set null,
  name text not null,
  slug text not null,
  description text,
  manufacturer text,
  product_model text,
  synonyms text[] not null default '{}',
  search_keywords text[] not null default '{}',
  gear_details jsonb,
  active boolean not null default true,
  date_added timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category_id, slug)
);

create index tags_category_id_idx on tags (category_id);
create index tags_parent_tag_id_idx on tags (parent_tag_id);
create index tags_active_idx on tags (active) where active;
create index tags_name_trgm_idx on tags using gin (name gin_trgm_ops);
create index tags_manufacturer_trgm_idx on tags using gin (manufacturer gin_trgm_ops);
create unique index tags_category_lower_name_idx on tags (category_id, lower(name));

-- Gear auto-inheritance: picking "Sony FX3" implies Sony, Cinema Camera,
-- Mirrorless Cinema Camera, Full Frame, and Sony E-Mount — five separate,
-- orthogonal edges, not one parent chain. That's why this is its own flat
-- join table rather than reusing parent_tag_id: a tag can have any number
-- of implied tags across totally different categories (manufacturer,
-- camera class, sensor format, mount) at once.
create table tag_implies (
  tag_id uuid not null references tags (id) on delete cascade,
  implied_tag_id uuid not null references tags (id) on delete cascade,
  primary key (tag_id, implied_tag_id),
  check (tag_id <> implied_tag_id)
);
create index tag_implies_implied_tag_id_idx on tag_implies (implied_tag_id);

-- video_tags: source distinguishes what a creator actually picked from
-- what got auto-attached via tag_implies/location ancestry. Display's
-- technical "Shot on:" tier reads only source='creator' (showing every
-- inherited manufacturer/mount tag there would be noisy); filtering reads
-- the full set regardless of source.
create table video_tags (
  video_id uuid not null references videos (id) on delete cascade,
  tag_id uuid not null references tags (id) on delete cascade,
  source text not null default 'creator' check (source in ('creator', 'inherited')),
  created_at timestamptz not null default now(),
  primary key (video_id, tag_id)
);
create index video_tags_tag_id_idx on video_tags (tag_id);

-- Recursive ancestor walk for a location tag's breadcrumb (City -> Region
-- -> Country -> Continent) — expressing this through PostgREST's JS client
-- isn't practical, hence an RPC function.
create function tag_ancestors(p_tag_id uuid)
returns setof tags
language sql stable
as $$
  with recursive ancestors as (
    select id, parent_tag_id from tags where id = p_tag_id
    union all
    select t.id, t.parent_tag_id from tags t join ancestors a on t.id = a.parent_tag_id
  )
  select tags.* from tags join ancestors on tags.id = ancestors.id where ancestors.id <> p_tag_id;
$$;

-- Combined-tag filtering: the spec's own example (Documentary + Surfing +
-- Cinematic + 16mm + South Africa -> one feed) reads as an intersection,
-- not "any of these" — a video must carry every tag in p_tag_ids.
create function match_all_tags(p_tag_ids uuid[])
returns setof uuid
language sql stable
as $$
  select video_id from video_tags
  where tag_id = any(p_tag_ids)
  group by video_id
  having count(distinct tag_id) = cardinality(p_tag_ids);
$$;

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table tag_categories enable row level security;
alter table tags enable row level security;
alter table tag_implies enable row level security;
alter table video_tags enable row level security;

-- Public reference data — same posture as collections (init.sql): readable
-- by anyone including signed-out visitors, writable only via migrations/
-- service-role. No client insert/update/delete policy exists on purpose;
-- creators only ever pick from existing tags, never create new ones.
create policy tag_categories_select_all on tag_categories for select using (true);
create policy tags_select_all on tags for select using (true);
create policy tag_implies_select_all on tag_implies for select using (true);

-- Mirrors videos_select_public's exact shape
-- (20260805000000_upload_pipeline.sql: "(visibility='public' and
-- processing_status='ready') or creator_id=auth.uid()") rather than
-- inventing a separate visibility rule for tags.
create policy video_tags_select_visible on video_tags for select
  using (
    exists (
      select 1 from videos
      where videos.id = video_tags.video_id
        and (
          (videos.visibility = 'public' and videos.processing_status = 'ready')
          or videos.creator_id = auth.uid()
        )
    )
  );

-- Deliberately does NOT require processing_status = 'ready' at insert time,
-- unlike clips_insert_own (20260914110000_complete_clips_authorization.sql)
-- — video_tags rows are written by /api/uploads the moment the video row
-- is created, while it's still 'uploading'. Requiring readiness here would
-- make every upload's own tag-write fail until the Stream webhook later
-- flips it to 'ready'.
create policy video_tags_insert_own on video_tags for insert
  with check (
    is_invited(auth.uid())
    and exists (select 1 from videos where videos.id = video_tags.video_id and videos.creator_id = auth.uid())
  );
create policy video_tags_delete_own on video_tags for delete
  using (exists (select 1 from videos where videos.id = video_tags.video_id and videos.creator_id = auth.uid()));
