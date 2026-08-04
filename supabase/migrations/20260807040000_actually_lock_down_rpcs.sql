-- FRAME — the previous two REVOKEs didn't actually work
--
-- Postgres grants EXECUTE on a newly created function to the PUBLIC
-- pseudo-role by default, independently of whatever's granted to specific
-- roles like `anon`/`authenticated`. Every role — anon included — inherits
-- PUBLIC's privileges implicitly. Revoking from anon/authenticated alone
-- (20260807020000, 20260807030000) left PUBLIC's grant standing, so both
-- functions remained callable by anon exactly as before. Verified live: the
-- previous revokes were confirmed run, and both functions were still
-- exploitable afterward. This is the actual fix.
revoke execute on function adjust_video_counter(uuid, text, integer) from public;
revoke execute on function redeem_invite_code(text) from public;
