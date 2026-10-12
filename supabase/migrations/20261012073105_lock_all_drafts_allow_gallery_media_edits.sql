CREATE OR REPLACE FUNCTION public.common_ground_submission_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_overview text;
  v_build text;
  v_manual_open boolean;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_closed boolean;
  v_is_organizer boolean := public.is_current_user_organizer();
  v_edit_start constant timestamptz := timestamptz '2026-10-12 00:00:00+08';
  v_edit_end constant timestamptz := timestamptz '2026-10-13 00:00:00+08';
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
        raise exception 'Project updates are open from 12:00 AM Monday, 12 October to 12:00 AM Tuesday, 13 October SGT.'
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
        raise exception 'Project image and demo link updates are open from 12:00 AM Monday, 12 October to 12:00 AM Tuesday, 13 October SGT.'
          using errcode = '55000';
      end if;

      if not v_is_organizer then
        if old.event_id is distinct from 'common-ground-2026-10-11'
           or new.event_id is distinct from 'common-ground-2026-10-11' then
          raise exception 'An existing project cannot be moved into or out of this event.'
            using errcode = '55000';
        end if;

        if old.status is distinct from 'ready' or new.status is distinct from 'ready' then
          raise exception 'Drafts and new projects cannot be edited or submitted. Only projects already submitted and visible in the gallery can update media.'
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

DELETE FROM private.allowed_final_submissions AS allowed
USING public.submissions AS submission
WHERE allowed.event_id = 'common-ground-2026-10-11'
  AND allowed.submission_id = submission.id
  AND submission.project ->> 'name' = 'Uno Dos Tres';
