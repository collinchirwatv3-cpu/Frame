-- FRAME — lets Search's Featured Collections actually query real curated
-- collections instead of mock-data.ts. Collections stay service-role/
-- SQL-editor curated, matching this table's own existing "platform-curated,
-- not creator-owned" design (public-read, no client insert/update/delete
-- grant at all, unchanged by this migration) — no admin UI, same precedent
-- as invite-code creation elsewhere in this project.
alter table collections
  add column is_featured boolean not null default false,
  add column curator_id uuid references profiles (id) on delete set null;
