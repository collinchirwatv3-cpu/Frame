-- FRAME — let users actually edit their own profile (username, display
-- name, bio, avatar, banner). Every user currently launches stuck at the
-- signup trigger's defaults ('user_xxxxxxxx' / 'New Creator' / '') with no
-- way to change them — the "Edit Profile" button in ProfileHeader has never
-- been wired to anything.
--
-- While wiring this up: profiles_update_own (20260101000000_init.sql) only
-- restricts which ROW an authenticated user can touch (`auth.uid() = id`).
-- Postgres RLS has no concept of column restriction, and this project has
-- never revoked the Supabase-default baseline grant of full-table UPDATE to
-- `authenticated`. That means, as shipped, any signed-in user could already
-- PATCH /rest/v1/profiles?id=eq.<own-id> with body like
-- { "is_moderator": true } or { "verified": true } or an arbitrary
-- followers_count/total_views — a live privilege-escalation and
-- stats-forgery hole, same class of bug as the RPC issue fixed in
-- 20260807040000, just via a missing column-level GRANT instead of a
-- missing REVOKE. Fixed here as part of the same change, since this
-- migration is what first makes profile UPDATE a real, used code path.
revoke update on table profiles from authenticated;
grant update (username, display_name, bio, website, avatar_url, banner_url)
  on profiles to authenticated;

-- Shape constraints so the now-editable columns can't be abused even within
-- what's grantable. Username format matches handle_new_user's own default
-- ('user_' + lowercase hex), so existing rows already satisfy it.
alter table profiles
  add constraint profiles_username_format check (username ~ '^[a-z0-9_]{3,24}$'),
  add constraint profiles_display_name_length check (char_length(display_name) between 1 and 50),
  add constraint profiles_bio_length check (char_length(bio) <= 280),
  add constraint profiles_website_length check (website is null or char_length(website) <= 120);

-- Storage bucket for avatar/banner uploads. Public read (avatars/banners are
-- always public-facing, same as the rest of a profile) — write restricted to
-- a user's own folder (`<uid>/...`) via storage.objects RLS below. Size/MIME
-- limits enforced at the bucket level, not just client-side.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-media', 'profile-media', true, 8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy profile_media_select_all on storage.objects
  for select using (bucket_id = 'profile-media');

create policy profile_media_insert_own on storage.objects
  for insert with check (
    bucket_id = 'profile-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy profile_media_update_own on storage.objects
  for update using (
    bucket_id = 'profile-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy profile_media_delete_own on storage.objects
  for delete using (
    bucket_id = 'profile-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
