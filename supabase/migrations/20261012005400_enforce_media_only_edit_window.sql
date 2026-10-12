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
  v_edit_start constant timestamptz := timestamptz '2026-10-12 12:00:00+08';
  v_edit_end constant timestamptz := timestamptz '2026-10-12 18:00:00+08';
begin
  if tg_op = 'INSERT' then
    if new.event_id = 'common-ground-2026-10-11' then
      select s.submissions_open into v_manual_open
      from public.people_choice_settings s
      where s.event_id = 'common-ground-2026-10-11';
      v_closed := not coalesce(v_manual_open, false)
        or v_now < v_edit_start
        or v_now >= v_edit_end;
      if v_closed then
        raise exception 'Project updates are open from 12:00 PM to 6:00 PM SGT Monday, 12 October.'
          using errcode = '55000';
      end if;
      if not v_is_organizer then
        raise exception 'New project entries are closed. You can only update an existing project.'
          using errcode = '55000';
      end if;
    end if;
  elsif tg_op = 'UPDATE' then
    if old.event_id = 'common-ground-2026-10-11' or new.event_id = 'common-ground-2026-10-11' then
      select s.submissions_open into v_manual_open
      from public.people_choice_settings s
      where s.event_id = 'common-ground-2026-10-11';
      v_closed := not coalesce(v_manual_open, false)
        or v_now < v_edit_start
        or v_now >= v_edit_end;
      if v_closed then
        raise exception 'Project image and demo link updates are open from 12:00 PM to 6:00 PM SGT Monday, 12 October.'
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

        if old.team is distinct from new.team then
          raise exception 'Team details are locked. Only the project preview image and demo links can be updated.'
            using errcode = '55000';
        end if;

        if (pg_catalog.to_jsonb(new) - 'project' - 'status' - 'updated_at')
           is distinct from
           (pg_catalog.to_jsonb(old) - 'project' - 'status' - 'updated_at') then
          raise exception 'Project details are locked. Only the project preview image and demo links can be updated.'
            using errcode = '55000';
        end if;

        if (coalesce(new.project, '{}'::jsonb) - 'previewImage' - 'preview_image_url' - 'preview_image' - 'demo' - 'video')
           is distinct from
           (coalesce(old.project, '{}'::jsonb) - 'previewImage' - 'preview_image_url' - 'preview_image' - 'demo' - 'video') then
          raise exception 'Project details are locked. Only the project preview image, live demo, and demo video links can be updated.'
            using errcode = '55000';
        end if;
      end if;
    end if;
  elsif tg_op = 'DELETE' then
    if old.event_id = 'common-ground-2026-10-11' then
      raise exception 'Submitted project records cannot be deleted by attendees.'
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

create or replace function public.get_common_ground_event_state()
returns table(current_at timestamptz, submissions_closed boolean, gallery_open boolean, voting_open boolean)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_manual_open boolean;
  v_paused boolean;
begin
  select s.submissions_open, coalesce(s.voting_paused, false)
    into v_manual_open, v_paused
  from public.people_choice_settings s
  where s.event_id = 'common-ground-2026-10-11';

  return query select
    v_now,
    not (
      coalesce(v_manual_open, false)
      and v_now >= timestamptz '2026-10-12 12:00:00+08'
      and v_now < timestamptz '2026-10-12 18:00:00+08'
    ),
    v_now >= timestamptz '2026-10-11 15:15:00+08',
    v_now >= timestamptz '2026-10-12 12:00:00+08'
      and v_now < timestamptz '2026-10-14 23:59:59+08'
      and not coalesce(v_paused, false);
end;
$function$;
