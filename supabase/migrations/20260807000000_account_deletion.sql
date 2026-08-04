-- FRAME — fix a real blocker for account deletion
--
-- reports.reviewed_by had no ON DELETE behavior (defaults to RESTRICT),
-- flagged as a latent defect twice already (the alpha audit, then again
-- during the invite-gate work) and now a real blocker: deleting a
-- moderator's account would fail outright with a foreign-key violation the
-- moment any report they'd reviewed exists. Set null instead of cascade —
-- deleting the moderator shouldn't delete the report itself, just the
-- record of who reviewed it.
--
-- Looks up the real constraint name rather than assuming Postgres's default
-- auto-generated naming (reports_reviewed_by_fkey) — cheap to verify, no
-- reason to guess when information_schema can just answer directly.
do $$
declare
  constraint_name text;
begin
  select tc.constraint_name into constraint_name
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu
    on tc.constraint_name = kcu.constraint_name
  where tc.table_name = 'reports'
    and tc.constraint_type = 'FOREIGN KEY'
    and kcu.column_name = 'reviewed_by';

  execute format('alter table reports drop constraint %I', constraint_name);
  execute 'alter table reports add constraint reports_reviewed_by_fkey
    foreign key (reviewed_by) references profiles (id) on delete set null';
end $$;
