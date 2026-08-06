-- FRAMES — "Shorts": a genuinely separate content type from the cinematic
-- landscape film library, introduced for the new Discover feed. Explicit
-- column rather than deriving from width/height at query time — deriving
-- from aspect ratio would make a perfectly square upload ambiguous, and
-- "is this a short" is a real product distinction (no quality scoring, no
-- FRAMES Certified badge eligibility, different discovery surface), not
-- just a shape.
create type video_content_type as enum ('film', 'short');

alter table videos
  add column content_type video_content_type not null default 'film';

-- Existing videos_select_public policy already covers both content types
-- (visibility + processing_status, not shape-specific) — no RLS change
-- needed, this column is purely descriptive/filterable.
create index videos_content_type_idx on videos (content_type) where visibility = 'public';
