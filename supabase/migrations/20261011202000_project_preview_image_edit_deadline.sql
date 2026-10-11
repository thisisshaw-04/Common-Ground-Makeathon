create or replace function public.common_ground_preview_image_deadline_guard()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_cutoff constant timestamptz := timestamptz '2026-10-13 18:00:00+08';
  v_old_image text;
  v_new_image text;
begin
  if new.event_id is distinct from 'common-ground-2026-10-11' then
    return new;
  end if;

  v_new_image := coalesce(
    nullif(pg_catalog.btrim(new.project ->> 'previewImage'), ''),
    nullif(pg_catalog.btrim(new.project ->> 'preview_image_url'), ''),
    nullif(pg_catalog.btrim(new.project ->> 'preview_image'), '')
  );

  if tg_op = 'UPDATE' then
    v_old_image := coalesce(
      nullif(pg_catalog.btrim(old.project ->> 'previewImage'), ''),
      nullif(pg_catalog.btrim(old.project ->> 'preview_image_url'), ''),
      nullif(pg_catalog.btrim(old.project ->> 'preview_image'), '')
    );
    if v_now < v_cutoff or v_new_image is not distinct from v_old_image then
      return new;
    end if;
  elsif tg_op = 'INSERT' then
    if v_now < v_cutoff or v_new_image is null then
      return new;
    end if;
  else
    return new;
  end if;

  raise exception 'Project preview images can be changed until 6:00 PM SGT Tuesday, 13 October.'
    using errcode = '55000';
end;
$function$;

revoke all on function public.common_ground_preview_image_deadline_guard() from public, anon, authenticated;

drop trigger if exists submissions_preview_image_deadline_guard on public.submissions;
create trigger submissions_preview_image_deadline_guard
before insert or update on public.submissions
for each row execute function public.common_ground_preview_image_deadline_guard();

create or replace function public.get_project_gallery_preview_images(
  p_event_id text default 'common-ground-2026-10-11'::text
)
returns table(submission_id uuid, preview_image_url text)
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if p_event_id is distinct from 'common-ground-2026-10-11' then
    raise exception 'This gallery is not available.' using errcode = '22023';
  end if;
  if pg_catalog.clock_timestamp() < timestamptz '2026-10-11 15:15:00+08' then
    raise exception 'The project gallery opens at 3:15 PM SGT.' using errcode = '55000';
  end if;

  return query
  select
    s.id,
    coalesce(
      nullif(pg_catalog.btrim(s.project ->> 'previewImage'), ''),
      nullif(pg_catalog.btrim(s.project ->> 'preview_image_url'), ''),
      nullif(pg_catalog.btrim(s.project ->> 'preview_image'), '')
    )
  from public.submissions s
  where s.event_id = 'common-ground-2026-10-11'
    and s.status = 'ready'
    and s.id <> 'fc032b32-cb78-4d22-b21c-4fc2f5e64540'::uuid;
end;
$function$;

revoke all on function public.get_project_gallery_preview_images(text) from public;
grant execute on function public.get_project_gallery_preview_images(text) to anon, authenticated;
