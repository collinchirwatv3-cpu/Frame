-- FRAME — release-blocker fix, completes 20260914060000_harden_clips_insert.sql.
-- That migration added the invite gate and a title length cap but left two
-- real gaps: clips_insert_own never checked the referenced video at all
-- (could point at a nonexistent video, a private video, or one still
-- uploading/processing/failed — clips are meant to be community discovery
-- on real, watchable public content), and clips_select_visible's "public"
-- branch didn't require processing_status = 'ready', so a clip could stay
-- visible (or newly become creatable, before this fix) against a video that
-- isn't actually playable yet.
--
-- Mirrors videos_select_public's own "public AND ready, or the owner"
-- shape (20260805000000_upload_pipeline.sql) rather than inventing a new
-- visibility rule.
--
-- Explicit decision on the owner exception: a video's OWNER may still see
-- clips against their own video regardless of its current visibility/
-- processing_status (kept from the existing policy) — consistent with
-- every other owner-sees-own-row exception in this schema, and lets a
-- creator review/moderate clips made while their video was public even
-- after later making it private. The owner exception is NOT extended to
-- INSERT: creating a clip is a community-discovery action against real,
-- watchable content, not a draft-editing feature, so even the video's own
-- owner cannot create a clip against their own not-yet-ready or private
-- video — there is no legitimate reason to clip an unplayable asset.
alter policy clips_insert_own on clips
  with check (
    auth.uid() = user_id
    and is_invited(auth.uid())
    and exists (
      select 1 from videos
      where videos.id = clips.video_id
        and videos.visibility = 'public'
        and videos.processing_status = 'ready'
    )
  );

alter policy clips_select_visible on clips
  using (
    exists (
      select 1 from videos
      where videos.id = clips.video_id
        and (
          (videos.visibility = 'public' and videos.processing_status = 'ready')
          or videos.creator_id = auth.uid()
        )
    )
  );
