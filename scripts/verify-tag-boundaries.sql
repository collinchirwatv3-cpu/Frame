-- Run in a transaction after migration 160000; rollback all fixtures afterward.
insert into auth.users(id, email, raw_user_meta_data) values
 ('a1000000-0000-4000-8000-000000000001', 'tag-boundary-owner@example.com', '{"username":"tag_boundary_owner"}'),
 ('a1000000-0000-4000-8000-000000000002', 'tag-boundary-blocked@example.com', '{"username":"tag_boundary_blocked"}');
update profiles set invite_redeemed_at = now() where id in
 ('a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002');
insert into blocks(blocker_id, blocked_id) values
 ('a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002');
insert into videos(id, creator_id, title, duration_seconds, width, height, content_type, visibility, processing_status, playback_url, poster_url)
select ('b1000000-0000-4000-8000-00000000000' || n)::uuid,
 case when n=4 then 'a1000000-0000-4000-8000-000000000002'::uuid else 'a1000000-0000-4000-8000-000000000001'::uuid end,
 'Boundary fixture', 200, 1920, 1080, 'film',
 case when n=2 then 'private'::video_visibility else 'public'::video_visibility end,
 (case when n=3 then 'uploading' else 'ready' end)::video_processing_status,
 'https://example.com/test.m3u8', 'https://example.com/test.jpg'
from generate_series(1,4) n;
insert into video_tags(video_id, tag_id)
select v.id, t.id from videos v cross join lateral
 (select id from tags where active limit 1) t
where v.id::text like 'b1000000-0000-4000-8000-%';
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
set local role authenticated;
do $$
declare v_id uuid; v_count integer;
begin
 if has_table_privilege(current_user, 'videos', 'INSERT') then raise exception 'Direct insert privilege remains'; end if;
 begin
   insert into videos(creator_id,title,duration_seconds,width,height) values(auth.uid(),'Bypass',200,1920,1080);
   raise exception 'Direct insert succeeded';
 exception when insufficient_privilege then null;
 end;
 select create_video_with_tags('tag-boundary-session','film','Atomic creation','',1920,1080,200,'post',
  (select t.id from tags t join tag_categories c on c.id=t.category_id where active and facet='content_type' limit 1),
  array[(select t.id from tags t join tag_categories c on c.id=t.category_id where active and facet='genre' limit 1)],
  array[(select t.id from tags t join tag_categories c on c.id=t.category_id where active and facet='topic' limit 1)],
  '{}',null,'{}') into v_id;
 if not exists(select 1 from videos where id=v_id and creator_id=auth.uid()) then raise exception 'Atomic creation failed'; end if;
 select count(*) into v_count from video_tags where video_id=v_id;
 if v_count<>3 then raise exception 'Required tags missing'; end if;
 -- Owner can read these rows normally, so RLS alone cannot satisfy public search.
 if not exists(select 1 from videos where id='b1000000-0000-4000-8000-000000000002') then raise exception 'Private fixture not owner-readable'; end if;
 if exists(select 1 from search_videos_by_tags('{}', array['film'],1000,0,'{}') where id in
 ('b1000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000003','b1000000-0000-4000-8000-000000000004',v_id)) then raise exception 'Private/unfinished/blocked video leaked into search'; end if;
 if not exists(select 1 from search_videos_by_tags('{}', array['film'],1000,0,'{}') where id='b1000000-0000-4000-8000-000000000001') then raise exception 'Public ready video missing'; end if;
 select count(*) into v_count from search_videos_by_tags(array[(select tag_id from video_tags where video_id='b1000000-0000-4000-8000-000000000001')],array['film'],1000,0,'{}') where id::text like 'b1000000-0000-4000-8000-%';
 if v_count<>1 then raise exception 'Tagged search visibility failed'; end if;
 raise notice 'PASS: direct insert denied; atomic creation + required tags work; public search excludes owner-private, unfinished and blocked videos';
end $$;
reset role;
set local role anon;
do $$ begin
 if has_table_privilege(current_user,'videos','INSERT') then raise exception 'Anonymous INSERT privilege remains'; end if;
 if has_function_privilege(current_user,'create_video_with_tags(text,text,text,text,integer,integer,numeric,text,uuid,uuid[],uuid[],uuid[],uuid,uuid[])','EXECUTE') then raise exception 'Anonymous creation RPC privilege exists'; end if;
 raise notice 'PASS: anonymous creation denied';
end $$;
reset role;
