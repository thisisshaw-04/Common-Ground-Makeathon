create or replace function public.common_ground_submission_guard()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_overview text;
  v_build text;
begin
  if tg_op = 'UPDATE' and
     (old.event_id = 'common-ground-2026-10-11' or new.event_id = 'common-ground-2026-10-11') and
     pg_catalog.clock_timestamp() >= timestamptz '2026-10-11 15:15:00+08' then
    raise exception 'Submissions closed at 3:15 PM SGT on 11 October 2026.'
      using errcode = '55000';
  elsif tg_op = 'DELETE' and old.event_id = 'common-ground-2026-10-11' and
        pg_catalog.clock_timestamp() >= timestamptz '2026-10-11 15:15:00+08' then
    raise exception 'Submissions closed at 3:15 PM SGT on 11 October 2026.'
      using errcode = '55000';
  elsif tg_op = 'INSERT' and new.event_id = 'common-ground-2026-10-11' and
        pg_catalog.clock_timestamp() >= timestamptz '2026-10-11 15:15:00+08' then
    raise exception 'Submissions closed at 3:15 PM SGT on 11 October 2026.'
      using errcode = '55000';
  end if;

  if tg_op = 'DELETE' then
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
