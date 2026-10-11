-- Let organisers export judge identities together with project scores.
-- The function exposes no judge data to anonymous or non-organiser users.
create or replace function public.get_common_ground_judging_export(
  p_event_id text default 'common-ground-2026-10-11'
)
returns table (
  submission_id uuid,
  judge_id uuid,
  judge_name text,
  judge_email text,
  concept smallint,
  track_fit smallint,
  execution smallint,
  presentation smallint,
  notes text,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_event_id is distinct from 'common-ground-2026-10-11' then
    raise exception 'Judging export is not available for this event.'
      using errcode = '22023';
  end if;
  if (select auth.uid()) is null or not (select public.is_current_user_organizer()) then
    raise exception 'Organizer access is required.'
      using errcode = '42501';
  end if;

  return query
  select
    score.submission_id,
    score.judge_id,
    coalesce(
      nullif(pg_catalog.btrim(user_record.raw_user_meta_data ->> 'full_name'), ''),
      nullif(pg_catalog.btrim(user_record.raw_user_meta_data ->> 'name'), ''),
      user_record.email
    ),
    user_record.email,
    score.concept,
    score.track_fit,
    score.execution,
    score.presentation,
    score.notes,
    score.updated_at
  from public.submission_scores as score
  join public.submissions as submission
    on submission.id = score.submission_id
  join auth.users as user_record
    on user_record.id = score.judge_id
  where submission.event_id = p_event_id
    and submission.status = 'ready'
  order by
    pg_catalog.lower(coalesce(user_record.email, '')),
    submission.project ->> 'name',
    score.updated_at;
end;
$$;

revoke all on function public.get_common_ground_judging_export(text)
  from public, anon, authenticated;
grant execute on function public.get_common_ground_judging_export(text)
  to authenticated;
