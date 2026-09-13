-- FRAME — release-blocker fix. likes/comments have existed since
-- 20260101000000_init.sql and never had a video-visibility boundary at
-- all — is_invited() (added later, 20260808030000_invite_gate_rls.sql)
-- gates WHO can write, but nothing has ever gated WHICH video a like/
-- comment can target, and likes_select_all has never checked video
-- visibility either. Two real gaps, both closed here:
--
-- 1. likes_select_all was `using (true)` — anyone, including a signed-out
--    visitor, could read every row in `likes` regardless of the
--    referenced video's visibility, leaking who liked a PRIVATE video (and
--    that it exists at all) to anyone who has or guesses its id. Now
--    mirrors videos_select_public's own "public AND ready, or the owner"
--    shape, same pattern already applied to clips_select_visible in
--    20260914110000_complete_clips_authorization.sql.
-- 2. Neither likes_insert_own nor comments_insert_own checked the target
--    video at all — an invited user could like/comment on a private,
--    still-uploading, or failed video's id if they had or guessed it, even
--    though the app's own UI never exposes such an id. Now requires the
--    video to be public and ready, matching clips_insert_own's shape.
--
-- Explicit decision on the owner exception (asked for by name in this
-- fix's spec): kept for SELECT (a creator can see likes/comments on their
-- own video regardless of its current visibility/processing_status — same
-- as clips, same as videos_select_public itself), but NOT extended to
-- INSERT. Liking or commenting on your own not-yet-public video isn't a
-- real feature anywhere in this app's UI, and there's no legitimate reason
-- for even the owner to write engagement against unplayable/unpublished
-- content — same reasoning, and same asymmetry, as clips_insert_own's
-- owner-exclusion.
--
-- comments_select_visible additionally gains the processing_status='ready'
-- check it never had (only checked visibility before) — a public-but-not-
-- yet-encoded video's comments were technically readable before, though
-- unreachable via any real UI since nothing links to an unready video.
alter policy likes_select_all on likes
  using (
    exists (
      select 1 from videos
      where videos.id = likes.video_id
        and (
          (videos.visibility = 'public' and videos.processing_status = 'ready')
          or videos.creator_id = auth.uid()
        )
    )
  );

alter policy likes_insert_own on likes
  with check (
    auth.uid() = user_id
    and is_invited(auth.uid())
    and exists (
      select 1 from videos
      where videos.id = likes.video_id
        and videos.visibility = 'public'
        and videos.processing_status = 'ready'
    )
  );

alter policy comments_select_visible on comments
  using (
    exists (
      select 1 from videos
      where videos.id = comments.video_id
        and (
          (videos.visibility = 'public' and videos.processing_status = 'ready')
          or videos.creator_id = auth.uid()
        )
    )
  );

alter policy comments_insert_own on comments
  with check (
    auth.uid() = user_id
    and is_invited(auth.uid())
    and exists (
      select 1 from videos
      where videos.id = comments.video_id
        and videos.visibility = 'public'
        and videos.processing_status = 'ready'
    )
  );
