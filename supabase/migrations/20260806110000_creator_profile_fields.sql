-- FRAMES — soft creator/general-user distinction: extend the self-editable
-- profile columns to cover the portfolio fields (statement, equipment,
-- available_for_hire) alongside the identity fields granted in
-- 20260808000000_profile_self_edit.sql. EditProfileModal only shows these
-- once a profile has a published video — no schema-level gating, that's a
-- client-side UX decision, not a security one (someone editing these before
-- publishing isn't a real risk, just an odd empty state to avoid).
grant update (statement, equipment, available_for_hire) on profiles to authenticated;

alter table profiles
  add constraint profiles_statement_length check (statement is null or char_length(statement) <= 500),
  add constraint profiles_equipment_limit check (equipment is null or array_length(equipment, 1) <= 12);
