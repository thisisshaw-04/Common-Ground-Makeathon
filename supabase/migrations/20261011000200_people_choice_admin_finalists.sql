create or replace function public.get_people_choice_admin_finalist_ids(p_event_id text default 'common-ground-2026-10-11')
returns table (submission_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not (select public.is_current_user_organizer()) then
    raise exception 'Only organisers can list selected finalists' using errcode = '42501';
  end if;
  return query
  select f.submission_id from public.people_choice_finalists f
  where f.event_id = p_event_id order by f.selected_at, f.submission_id;
end;
$$;
revoke all on function public.get_people_choice_admin_finalist_ids(text) from public, anon, authenticated;
grant execute on function public.get_people_choice_admin_finalist_ids(text) to authenticated;
