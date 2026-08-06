-- Moderation dashboard — a moderator reviewing a report needs to see the
-- reported video regardless of its visibility/processing_status.
-- videos_select_public (20260101000000_init.sql) only allows a public+ready
-- row, or the creator's own — a moderator is neither, so a report filed
-- against a private video would silently fail to load anything to review.
-- Read-only: this grants no write access, videos UPDATE/DELETE for
-- moderators still goes through the service-role client in
-- /api/moderation/reports/[reportId] (RLS/grants intentionally don't cover
-- it — matches the "no direct client writes to videos" posture from
-- 20260806130000_lock_down_videos_update.sql).
create policy videos_select_moderators on videos for select
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_moderator));
