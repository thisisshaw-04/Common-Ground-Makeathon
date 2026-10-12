create table private.allowed_final_submissions (
  event_id text not null,
  submission_id uuid not null references public.submissions(id) on delete cascade,
  primary key (event_id, submission_id)
);

alter table private.allowed_final_submissions enable row level security;
revoke all privileges on table private.allowed_final_submissions from public, anon, authenticated;

do $seed$
declare
  v_matches integer;
  v_submission_id uuid;
begin
  select count(*) into v_matches
  from public.submissions
  where event_id = 'common-ground-2026-10-11'
    and status = 'draft'
    and pg_catalog.lower(pg_catalog.btrim(team ->> 'name')) = 'uno dos tres'
    and pg_catalog.lower(pg_catalog.btrim(project ->> 'name')) = 'uno dos tres';

  if v_matches <> 1 then
    raise exception 'Expected exactly one saved Uno Dos Tres draft; found %.', v_matches;
  end if;

  select id into v_submission_id
  from public.submissions
  where event_id = 'common-ground-2026-10-11'
    and status = 'draft'
    and pg_catalog.lower(pg_catalog.btrim(team ->> 'name')) = 'uno dos tres'
    and pg_catalog.lower(pg_catalog.btrim(project ->> 'name')) = 'uno dos tres';

  insert into private.allowed_final_submissions (event_id, submission_id)
  values ('common-ground-2026-10-11', v_submission_id);
end;
$seed$;

create or replace function public.common_ground_submission_guard()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_overview text;
  v_build text;
  v_manual_open boolean;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_closed boolean;
  v_is_organizer boolean := public.is_current_user_organizer();
begin
  if tg_op = 'INSERT' then
    if new.event_id = 'common-ground-2026-10-11' then
      select s.submissions_open into v_manual_open
      from public.people_choice_settings s
      where s.event_id = 'common-ground-2026-10-11';
      v_closed := case
        when v_manual_open is null then v_now >= timestamptz '2026-10-11 16:08:02.945348+08'
        else not v_manual_open
      end;
      if v_closed then
        raise exception 'Submissions are closed by the event schedule or an organiser.'
          using errcode = '55000';
      end if;
      if not v_is_organizer then
        raise exception 'New project submissions are closed. Existing saved entries can still be edited.'
          using errcode = '55000';
      end if;
    end if;
  elsif tg_op = 'UPDATE' then
    if old.event_id = 'common-ground-2026-10-11' or new.event_id = 'common-ground-2026-10-11' then
      select s.submissions_open into v_manual_open
      from public.people_choice_settings s
      where s.event_id = 'common-ground-2026-10-11';
      v_closed := case
        when v_manual_open is null then v_now >= timestamptz '2026-10-11 16:08:02.945348+08'
        else not v_manual_open
      end;
      if v_closed then
        raise exception 'Submissions are closed by the event schedule or an organiser.'
          using errcode = '55000';
      end if;

      if not v_is_organizer then
        if old.event_id is distinct from 'common-ground-2026-10-11'
           or new.event_id is distinct from 'common-ground-2026-10-11' then
          raise exception 'An existing project cannot be moved into or out of this event.'
            using errcode = '55000';
        end if;

        if old.status not in ('draft', 'ready') or new.status not in ('draft', 'ready') then
          raise exception 'Existing projects can only remain drafts or submitted entries.'
            using errcode = '55000';
        end if;

        if old.status = 'ready' and new.status <> 'ready' then
          raise exception 'A submitted project cannot be changed back to a draft.'
            using errcode = '55000';
        end if;

        if old.status = 'draft' and new.status = 'ready'
           and not exists (
             select 1
             from private.allowed_final_submissions allowed
             where allowed.event_id = 'common-ground-2026-10-11'
               and allowed.submission_id = old.id
           ) then
          raise exception 'Only the existing Uno Dos Tres entry may be submitted. Other saved projects can still be edited.'
            using errcode = '55000';
        end if;
      end if;
    end if;
  elsif tg_op = 'DELETE' then
    if old.event_id = 'common-ground-2026-10-11' and
       v_now >= timestamptz '2026-10-11 16:08:02.945348+08' then
      raise exception 'Submissions are closed by the event schedule or an organiser.'
        using errcode = '55000';
    end if;
    return old;
  end if;

  new.updated_at := pg_catalog.clock_timestamp();
  if new.event_id = 'common-ground-2026-10-11' and new.status = 'ready' then
    v_overview := coalesce(
      nullif(pg_catalog.btrim(new.project ->> 'overview'), ''),
      pg_catalog.concat_ws(' ',
        new.project ->> 'oneLiner',
        new.project ->> 'inspiration',
        new.project ->> 'solution',
        new.project ->> 'interesting'
      )
    );
    v_build := coalesce(
      nullif(pg_catalog.btrim(new.project ->> 'build'), ''),
      pg_catalog.concat_ws(' ',
        new.project ->> 'technology',
        new.project ->> 'made',
        new.project ->> 'experiment',
        new.project ->> 'next'
      )
    );
    if pg_catalog.length(pg_catalog.btrim(v_overview)) > 0 and
       pg_catalog.cardinality(pg_catalog.regexp_split_to_array(pg_catalog.btrim(v_overview), '[[:space:]]+')) > 100 then
      raise exception 'Project Overview must be 100 words or fewer.'
        using errcode = '22023';
    end if;
    if pg_catalog.length(pg_catalog.btrim(v_build)) > 0 and
       pg_catalog.cardinality(pg_catalog.regexp_split_to_array(pg_catalog.btrim(v_build), '[[:space:]]+')) > 100 then
      raise exception 'The Build must be 100 words or fewer.'
        using errcode = '22023';
    end if;
  end if;
  return new;
end;
$function$;

create or replace function public.common_ground_preview_image_deadline_guard()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_cutoff constant timestamptz := timestamptz '2026-10-12 18:00:00+08';
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

  raise exception 'Project preview images can be changed until 6:00 PM SGT Monday, 12 October.'
    using errcode = '55000';
end;
$function$;