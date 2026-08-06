-- FRAMES rebrand — the "FRAME Certified" badge is now "FRAMES Certified".
-- No schema change (badges is a free-text array, no CHECK constraint on
-- values) — just fixing the two demo rows that already stored the old
-- string literal so they match the renamed Badge type/UI.
update videos
set badges = array_replace(badges, 'FRAME Certified', 'FRAMES Certified')
where 'FRAME Certified' = any(badges);
