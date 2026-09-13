-- FRAME — Instagram link on a profile, alongside the existing website
-- field. Mirrors website's shape exactly (plain nullable text, a length
-- constraint, no format validation beyond that).
--
-- Profile column updates go through an explicit column-level GRANT
-- allowlist, not RLS alone (see 20260808000000_profile_self_edit.sql's own
-- comment on why: RLS only restricts which ROW, not which COLUMN, so this
-- project revoked the blanket UPDATE grant and grants back only specific
-- columns). Column-level GRANTs are additive — this does not need to
-- repeat the existing column list, just add this one.
alter table profiles
  add column instagram_handle text,
  add constraint profiles_instagram_handle_length check (
    instagram_handle is null or char_length(instagram_handle) <= 30
  );

grant update (instagram_handle) on profiles to authenticated;
