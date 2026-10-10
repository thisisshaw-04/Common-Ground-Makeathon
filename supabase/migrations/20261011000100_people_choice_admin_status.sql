create or replace function public.get_people_choice_admin_status(p_event_id text default 'common-ground-2026-10-11')
returns table (voting_open boolean, finalist_count integer, vote_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not (select public.is_current_user_organizer()) then
    raise exception 'Only organisers can view People''s Choice controls' using errcode = '42501';
  end if;
  return query
  select
    coalesce((select s.voting_open from public.people_choice_settings s where s.event_id = p_event_id), false),
    (select count(*)::integer from public.people_choice_finalists f
     join public.submissions s on s.id = f.submission_id
     where f.event_id = p_event_id and s.status = 'ready'),
    (select count(*) from public.people_choice_votes v where v.event_id = p_event_id);
end;
$$;
revoke all on function public.get_people_choice_admin_status(text) from public, anon, authenticated;
grant execute on function public.get_people_choice_admin_status(text) to authenticated;
