-- FRAME — fix a real defect in the upload pipeline's own ready constraint
--
-- videos_ready_requires_playback_data required playback_url, poster_url,
-- width, height, AND duration_seconds all non-null before a video could be
-- marked 'ready'. But the webhook handler marks ready as soon as Stream
-- reports readyToStream: true — if Stream's response ever has a
-- momentarily-null thumbnail at that exact instant (plausible; thumbnail
-- generation and encode-completion aren't guaranteed to land together),
-- the webhook's own update would violate its own constraint and the video
-- would get stuck in 'processing' forever with an opaque 500, with no
-- retry path. playback_url is the only field truly essential for
-- playability — a missing thumbnail is a real but non-blocking gap, not a
-- reason to withhold the whole video.
alter table videos drop constraint videos_ready_requires_playback_data;
alter table videos add constraint videos_ready_requires_playback_url check (
  processing_status <> 'ready' or playback_url is not null
);
