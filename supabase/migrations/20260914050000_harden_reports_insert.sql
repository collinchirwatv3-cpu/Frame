-- FRAME — HIGH severity fix. reports_insert_own only checked
-- `auth.uid() = reporter_id`, so a reporting user could insert a row with a
-- forged status ('dismissed'/'reviewed') and a forged reviewed_by, hiding
-- their own report from the moderation queue on arrival — the moderation
-- page (src/app/moderation/page.tsx) only ever queries
-- `status = 'pending'`, and /api/reports/route.ts's rate limiter is bypassed
-- entirely since the insert would never reach that path.
--
-- Reports also had no explicit revoke on update/delete for
-- authenticated/anon — RLS already blocks both (no matching policy), but
-- add the revoke anyway as belt-and-braces, matching this schema's existing
-- explicit-revoke convention for sensitive audit-trail tables.
alter policy reports_insert_own on reports
  with check (auth.uid() = reporter_id and status = 'pending' and reviewed_by is null and reviewed_at is null);

revoke update, delete on table reports from authenticated, anon, public;
