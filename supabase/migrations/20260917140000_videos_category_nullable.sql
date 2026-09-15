-- FRAME Tag Taxonomy — videos.category becomes optional. The new upload
-- flow writes real content-type tags (tag_categories.facet='content_type')
-- instead of this single hardcoded enum column. Old rows keep their
-- existing value for fallback display; nothing is backfilled or deleted —
-- the new tag system and this legacy column coexist, same tolerance this
-- schema already has for videos.badges existing alongside computeBadges().
alter table videos alter column category drop not null;
