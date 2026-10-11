alter table public.people_choice_settings
  add column if not exists submissions_open boolean;

comment on column public.people_choice_settings.submissions_open is
  'Nullable organiser override for Common Ground submissions; null follows the scheduled cutoff.';

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
  if tg_op <> 'DELETE' and
     (new.event_id = 'common-ground-2026-10-11' or
      (tg_op = 'UPDATE' and old.event_id = 'common-ground-2026-10-11')) then
    select s.submissions_open
      into v_manual_open
    from public.people_choice_settings s
    where s.event_id = 'common-ground-2026-10-11';
    v_closed := case
      when v_manual_open is null then v_now >= timestamptz '2026-10-11 16:08:02.945348+08'
      else not v_manual_open
    end;
  end if;

  if tg_op = 'UPDATE' and
     (old.event_id = 'common-ground-2026-10-11' or new.event_id = 'common-ground-2026-10-11') and
     coalesce(v_closed, false) then
    raise exception 'Submissions are closed by the event schedule or an organiser.'
      using errcode = '55000';
  elsif tg_op = 'DELETE' and old.event_id = 'common-ground-2026-10-11' and
        v_now >= timestamptz '2026-10-11 16:08:02.945348+08' then
    raise exception 'Submissions are closed by the event schedule or an organiser.'
      using errcode = '55000';
  elsif tg_op = 'INSERT' and new.event_id = 'common-ground-2026-10-11' and
        coalesce(v_closed, false) then
    raise exception 'Submissions are closed by the event schedule or an organiser.'
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
    case
      when v_manual_open is null then v_now >= timestamptz '2026-10-11 16:08:02.945348+08'
      else not v_manual_open
    end,
    v_now >= timestamptz '2026-10-11 15:15:00+08',
    v_now >= timestamptz '2026-10-11 15:15:00+08'
      and v_now < timestamptz '2026-10-11 17:00:00+08'
      and not coalesce(v_paused, false);
end;
$function$;

create or replace function public.set_common_ground_submissions_open(
  p_open boolean,
  p_event_id text default 'common-ground-2026-10-11'
)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if p_event_id is distinct from 'common-ground-2026-10-11' then
    raise exception 'This event is not available.' using errcode = '22023';
  end if;
  if (select auth.uid()) is null or not (select public.is_current_user_organizer()) then
    raise exception 'Only organisers can change submission access.' using errcode = '42501';
  end if;

  insert into public.people_choice_settings(event_id, submissions_open, updated_at, updated_by)
  values (p_event_id, coalesce(p_open, false), pg_catalog.clock_timestamp(), (select auth.uid()))
  on conflict(event_id) do update set
    submissions_open = excluded.submissions_open,
    updated_at = excluded.updated_at,
    updated_by = excluded.updated_by;

  return coalesce(p_open, false);
end;
$function$;

revoke all on function public.set_common_ground_submissions_open(boolean, text) from public, anon, authenticated;
grant execute on function public.set_common_ground_submissions_open(boolean, text) to authenticated;

update public.people_choice_settings
set submissions_open = true,
    updated_at = pg_catalog.clock_timestamp()
where event_id = 'common-ground-2026-10-11';
