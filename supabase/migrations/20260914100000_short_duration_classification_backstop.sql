-- FRAME — release-blocker fix, database-level backstop. The client-probed
-- duration sent to /api/uploads is not authoritative — a hand-crafted
-- request can claim any durationSeconds (e.g. 200s, to pass the
-- monetise-requires-long-form check) and then upload an actually-short
-- file. src/app/api/webhooks/stream/route.ts now forces content_type =
-- 'short'/publish_mode = 'post' when Cloudflare's own measured duration
-- comes back under the longform threshold (180s, LONGFORM_MIN_DURATION_SECONDS
-- in src/lib/validation/upload.ts) — this constraint is the structural
-- backstop for that application-layer fix: even the service-role webhook
-- (which bypasses every RLS policy and table grant) cannot write a row
-- that's actually short-duration but still classified as film/longform or
-- still monetised/promoted, matching this schema's existing preference for
-- "structural enforcement, not an application-layer check" (see
-- videos_insert_own's publish_mode-eligibility check in
-- 20260808060000_monetization_enums_and_eligibility.sql).
--
-- Only constrains the "must not stay long-classified" direction: a row
-- whose duration is under 180s MUST be content_type = 'short' and
-- publish_mode = 'post'. Does not require the reverse (every >=180s video
-- being film/longform is a creator choice, not a security boundary) — a
-- row with duration_seconds >= 180 always satisfies this check regardless
-- of its content_type/publish_mode.
--
-- NOT VALID, deliberately: live-checked against the real dev database
-- before writing this migration, and found 5 pre-existing seed/demo videos
-- (content_type='film', duration well under 180s — predating this rule,
-- not an exploited row: publish_mode is 'post' on all 5, never 'monetise')
-- that a validating ADD CONSTRAINT would fail on immediately. NOT VALID
-- still enforces the check on every INSERT and UPDATE from this point
-- forward (including the webhook's own future updates) — it only skips
-- retroactively scanning existing rows. Reclassify or backfill the 5
-- legacy rows separately, then `alter table videos validate constraint
-- videos_short_duration_classification;` to close that last gap — not
-- done here since it's a data decision (are those 5 actually meant to be
-- shorts?), not a security fix.
alter table videos
  add constraint videos_short_duration_classification
  check (duration_seconds >= 180 or (content_type = 'short' and publish_mode = 'post'))
  not valid;
