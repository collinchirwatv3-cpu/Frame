-- Six minutes inclusive is Shorts; longer videos remain film/longform.
-- Normalize at the database boundary as well as in upload validation so
-- direct writes and authoritative Stream duration corrections agree.
begin;
alter table public.videos drop constraint if exists videos_short_duration_classification;

create or replace function public.classify_video_duration()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.duration_seconds <= 360 then
    new.content_type := 'short';
    new.publish_mode := 'post';
  elsif new.duration_seconds > 360 and new.content_type = 'short' then
    new.content_type := 'film';
  end if;
  return new;
end;
$$;
create trigger videos_classify_duration
before insert or update of duration_seconds, content_type, publish_mode on public.videos
for each row execute function public.classify_video_duration();

-- Reclassify existing records without deleting their media or interactions.
update public.videos set content_type = 'short', publish_mode = 'post'
where duration_seconds <= 360
  and (content_type <> 'short' or publish_mode <> 'post');
update public.videos set content_type = 'film'
where duration_seconds > 360 and content_type = 'short';

alter table public.videos add constraint videos_short_duration_classification
check (
  duration_seconds is null
  or (duration_seconds <= 360 and content_type = 'short' and publish_mode = 'post')
  or (duration_seconds > 360 and content_type in ('film', 'longform'))
);
commit;
