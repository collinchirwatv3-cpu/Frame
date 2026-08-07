-- FRAME — let users reply to a comment, single level deep (a reply can't
-- itself be replied to — same convention as Instagram/YouTube's default
-- threading, not arbitrary-depth nesting). comments.parent_id is nullable
-- and self-referencing: null = a top-level comment, set = a reply to that
-- comment. Enforcing "single level" happens in the app layer (the reply
-- composer only ever attaches to a top-level comment's id, never to another
-- reply's), not a CHECK constraint — doing it in SQL would need a recursive
-- lookup for no real benefit at this depth.
--
-- No RLS changes needed: comments_insert_own/comments_select_visible/
-- comments_delete_own_or_video_owner (20260101000000_init.sql) are all
-- per-row policies already agnostic to parent_id — a reply is just another
-- comments row, same ownership/visibility rules apply unchanged.
alter table comments
  add column parent_id uuid references comments (id) on delete cascade;

create index comments_parent_id_idx on comments (parent_id);
