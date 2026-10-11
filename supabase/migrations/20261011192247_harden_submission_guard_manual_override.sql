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
