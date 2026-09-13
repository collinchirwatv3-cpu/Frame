-- FRAME — HIGH severity fix. clips_insert_own was the only user-content
-- insert policy in the schema missing is_invited(auth.uid()) — its own
-- comment says it was "modeled directly on comments," but copied
-- comments_insert_own's ORIGINAL init.sql shape rather than the version
-- amended 5 migrations later to add the invite gate. Without it, any
-- signed-in-but-uninvited OAuth account can create clips on any public
-- video during the closed-alpha/invite-gated period.
--
-- Also: clips.title had no length constraint, unlike every sibling
-- free-text column, and clips had no explicit revoke (every other
-- post-August content table either has one or is covered by this same
-- sweep) — both fixed here.
alter policy clips_insert_own on clips
  with check (auth.uid() = user_id and is_invited(auth.uid()));

alter table clips
  add constraint clips_title_length check (title is null or char_length(title) <= 80);

revoke insert, update, delete on table clips from authenticated, anon, public;
grant insert (video_id, user_id, start_seconds, end_seconds, title) on clips to authenticated;
grant delete on clips to authenticated;
