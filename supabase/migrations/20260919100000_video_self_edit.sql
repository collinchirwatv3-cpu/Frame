-- FRAME — first real "edit your Frame" feature: title + description only.
-- videos_update_own (20260101000000_init.sql) restricts which ROW an
-- authenticated user can touch (`creator_id = auth.uid()`), not which
-- COLUMNS — the blanket table-wide UPDATE grant to `authenticated` was
-- revoked entirely in 20260806130000_lock_down_videos_update.sql, whose
-- own comment says a real edit feature should get "its own deliberate
-- column-level grant then, not a default-open one now." This is that
-- grant — same shape as profiles' self-edit
-- (20260808000000_profile_self_edit.sql): revoke was already total, so
-- only a grant is needed here, not another revoke first.
--
-- Tags are deliberately NOT included here. Editing an already-published
-- video's tags would need the same validation + inheritance-resolution
-- logic as create_video_with_tags (20260917150000_video_tags_atomic_write.sql)
-- applied to a diff against existing selections — a separate, larger piece
-- of work, not a column to fold into this migration.
--
-- Delete needs no new grant at all: videos_delete_own already exists
-- (20260101000000_init.sql) and the table-level DELETE grant to
-- `authenticated` was never revoked (only UPDATE was) — deleting your own
-- video already works at the database layer today, it just has no route
-- or UI calling it for a published video yet.
grant update (title, description) on videos to authenticated;

-- Mirrors uploadMetadataSchema's own limits (src/lib/validation/upload.ts)
-- so the same bounds apply whether a video's title/description is set at
-- upload time or edited afterward — enforced at the database boundary
-- regardless of which route writes it.
alter table videos
  add constraint videos_title_length check (char_length(title) between 1 and 120),
  add constraint videos_description_length check (char_length(description) <= 2000);
