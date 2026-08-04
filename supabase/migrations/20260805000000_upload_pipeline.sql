-- FRAME — real upload pipeline
--
-- Replaces the simulated publish() in UploadDropzone.tsx with a real
-- Cloudflare Stream direct-upload flow. A video row is now created the
-- moment an upload session is minted (processing_status = 'uploading'),
-- long before Stream has actually finished transcoding — so playback_url,
-- poster_url, width, height, and duration_seconds can no longer be NOT NULL
-- at insert time. Faking those values to satisfy a NOT NULL constraint would
-- be exactly the kind of dishonest placeholder this project's own
-- conventions warn against (see README.md "Metadata display — client vs
-- server honesty"), so they're now genuinely nullable until Stream's webhook
-- confirms the video is ready, enforced by a check constraint below rather
-- than left as an unenforced convention.

-- ============================================================================
-- processing_status — mirrors Cloudflare Stream's own encode lifecycle
-- ============================================================================
create type video_processing_status as enum ('uploading', 'processing', 'ready', 'failed');

alter table videos
  add column processing_status video_processing_status not null default 'uploading',
  add column stream_uid text unique;

alter table videos alter column playback_url drop not null;
alter table videos alter column poster_url drop not null;
alter table videos alter column width drop not null;
alter table videos alter column height drop not null;
alter table videos alter column duration_seconds drop not null;

alter table videos add constraint videos_ready_requires_playback_data check (
  processing_status <> 'ready'
  or (
    playback_url is not null
    and poster_url is not null
    and width is not null
    and height is not null
    and duration_seconds is not null
  )
);

create index videos_processing_status_idx on videos (processing_status);

-- ============================================================================
-- RLS: public visibility now also requires the video to actually be ready —
-- an uploading/processing/failed row is real, but it isn't a real *video*
-- yet, and must never appear in anyone else's feed/Explore/profile grid.
-- The owner can still see their own row in any status, to show upload
-- progress on their own Profile.
-- ============================================================================
drop policy videos_select_public on videos;
create policy videos_select_public on videos for select
  using ((visibility = 'public' and processing_status = 'ready') or creator_id = auth.uid());
