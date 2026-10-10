-- People's Choice: eligible attendee voting, organiser-managed finalists, one ballot per account.
create table if not exists public.people_choice_settings (
  event_id text primary key,
  voting_open boolean not null default false,
  updated_at timestamptz not null default pg_catalog.now(),
  updated_by uuid references auth.users(id) on delete set null
);
insert into public.people_choice_settings (event_id)
values ('common-ground-2026-10-11')
on conflict (event_id) do nothing;

create table if not exists public.people_choice_finalists (
  event_id text not null,
  submission_id uuid not null references public.submissions(id) on delete cascade,
  selected_at timestamptz not null default pg_catalog.now(),
  primary key (event_id, submission_id)
);

create table if not exists public.people_choice_votes (
  event_id text not null,
  voter_id uuid not null references auth.users(id) on delete cascade,
  submission_id uuid not null,
  created_at timestamptz not null default pg_catalog.now(),
  primary key (event_id, voter_id),
  foreign key (event_id, submission_id)
    references public.people_choice_finalists(event_id, submission_id) on delete cascade
);

alter table public.people_choice_settings enable row level security;
alter table public.people_choice_finalists enable row level security;
alter table public.people_choice_votes enable row level security;
revoke all on public.people_choice_settings, public.people_choice_finalists, public.people_choice_votes from public, anon, authenticated;

create or replace function public.get_people_choice_status(p_event_id text default 'common-ground-2026-10-11')
returns table (voting_open boolean, finalist_count integer, my_vote uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in is required to view People''s Choice' using errcode = '28000';
  end if;
  if not (select public.is_current_user_eligible()) then
    raise exception 'This email is not on the approved builder list' using errcode = '42501';
  end if;
  return query
  select
    coalesce((select s.voting_open from public.people_choice_settings s where s.event_id = p_event_id), false),
    (select count(*)::integer from public.people_choice_finalists f
     join public.submissions s on s.id = f.submission_id
     where f.event_id = p_event_id and s.status = 'ready'),
    (select v.submission_id from public.people_choice_votes v
     where v.event_id = p_event_id and v.voter_id = (select auth.uid())
     limit 1);
end;
$$;

create or replace function public.get_people_choice_finalists(p_event_id text default 'common-ground-2026-10-11')
returns table (
  submission_id uuid,
  project_name text,
  team_name text,
  one_liner text,
  project_overview text,
  demo_url text,
  demo_video_url text,
  prototype_url text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in is required to view finalists' using errcode = '28000';
  end if;
  if not (select public.is_current_user_eligible()) then
    raise exception 'This email is not on the approved builder list' using errcode = '42501';
  end if;
  return query
  select
    s.id,
    coalesce(s.project->>'name', 'Untitled project'),
    coalesce(s.team->>'name', 'Team'),
    coalesce(s.project->>'oneLiner', ''),
    concat_ws(' ',
      nullif(s.project->>'inspiration', ''),
      nullif(s.project->>'solution', ''),
      nullif(s.project->>'interesting', '')
    ),
    coalesce(s.project->>'demo', ''),
    coalesce(s.project->>'video', ''),
    coalesce(s.project->>'prototype', '')
  from public.people_choice_finalists f
  join public.submissions s on s.id = f.submission_id
  where f.event_id = p_event_id and s.event_id = p_event_id and s.status = 'ready'
  order by lower(coalesce(s.project->>'name', '')), lower(coalesce(s.team->>'name', ''));
end;
$$;

create or replace function public.cast_people_choice_vote(
  p_submission_id uuid,
  p_event_id text default 'common-ground-2026-10-11'
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_open boolean;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in is required to vote' using errcode = '28000';
  end if;
  if not (select public.is_current_user_eligible()) then
    raise exception 'Only approved attendees can vote' using errcode = '42501';
  end if;
  select s.voting_open into v_open
  from public.people_choice_settings s
  where s.event_id = p_event_id
  for share;
  if not coalesce(v_open, false) then
    raise exception 'People''s Choice voting is not open' using errcode = '55000';
  end if;
  if not exists (
    select 1 from public.people_choice_finalists f
    join public.submissions s on s.id = f.submission_id
    where f.event_id = p_event_id
      and f.submission_id = p_submission_id
      and s.event_id = p_event_id
      and s.status = 'ready'
  ) then
    raise exception 'That project is not an eligible finalist' using errcode = '22023';
  end if;
  begin
    insert into public.people_choice_votes (event_id, voter_id, submission_id)
    values (p_event_id, (select auth.uid()), p_submission_id);
  exception when unique_violation then
    raise exception 'You have already cast your People''s Choice vote' using errcode = '23505';
  end;
  return true;
end;
$$;

create or replace function public.set_people_choice_finalists(
  p_submission_ids uuid[],
  p_event_id text default 'common-ground-2026-10-11'
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if (select auth.uid()) is null or not (select public.is_current_user_organizer()) then
    raise exception 'Only organisers can select People''s Choice finalists' using errcode = '42501';
  end if;
  if p_submission_ids is null or pg_catalog.cardinality(p_submission_ids) < 2
     or pg_catalog.cardinality(p_submission_ids) > 8
     or pg_catalog.array_position(p_submission_ids, null) is not null then
    raise exception 'Select between 2 and 8 finalists' using errcode = '22023';
  end if;
  select count(distinct candidate_id)::integer into v_count
  from pg_catalog.unnest(p_submission_ids) as candidate(candidate_id);
  if v_count <> pg_catalog.cardinality(p_submission_ids) then
    raise exception 'A project can only be selected once' using errcode = '22023';
  end if;
  insert into public.people_choice_settings (event_id)
  values (p_event_id)
  on conflict (event_id) do nothing;
  perform 1 from public.people_choice_settings s where s.event_id = p_event_id for update;
  if exists (select 1 from public.people_choice_settings s where s.event_id = p_event_id and s.voting_open) then
    raise exception 'Close voting before changing finalists' using errcode = '55000';
  end if;
  if exists (select 1 from public.people_choice_votes v where v.event_id = p_event_id) then
    raise exception 'Finalists are locked after the first vote is cast' using errcode = '55000';
  end if;
  if (select count(*) from public.submissions s
      where s.event_id = p_event_id and s.id = any(p_submission_ids) and s.status = 'ready') <> v_count then
    raise exception 'Every finalist must be a ready submission for this event' using errcode = '22023';
  end if;
  delete from public.people_choice_finalists f where f.event_id = p_event_id;
  insert into public.people_choice_finalists (event_id, submission_id)
  select p_event_id, candidate_id
  from pg_catalog.unnest(p_submission_ids) as candidate(candidate_id);
  return v_count;
end;
$$;

create or replace function public.set_people_choice_voting(
  p_open boolean,
  p_event_id text default 'common-ground-2026-10-11'
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_finalists integer;
begin
  if (select auth.uid()) is null or not (select public.is_current_user_organizer()) then
    raise exception 'Only organisers can change People''s Choice voting' using errcode = '42501';
  end if;
  insert into public.people_choice_settings (event_id)
  values (p_event_id)
  on conflict (event_id) do nothing;
  perform 1 from public.people_choice_settings s where s.event_id = p_event_id for update;
  if p_open then
    select count(*)::integer into v_finalists
    from public.people_choice_finalists f
    join public.submissions s on s.id = f.submission_id
    where f.event_id = p_event_id and s.event_id = p_event_id and s.status = 'ready';
    if v_finalists < 2 or v_finalists > 8 then
      raise exception 'Select 2 to 8 ready finalists before opening voting' using errcode = '55000';
    end if;
    if exists (select 1 from public.people_choice_votes v where v.event_id = p_event_id) then
      raise exception 'Voting cannot be reopened after a ballot has been cast' using errcode = '55000';
    end if;
  end if;
  update public.people_choice_settings
  set voting_open = p_open, updated_at = pg_catalog.now(), updated_by = (select auth.uid())
  where event_id = p_event_id;
  return p_open;
end;
$$;

create or replace function public.get_people_choice_results(p_event_id text default 'common-ground-2026-10-11')
returns table (submission_id uuid, project_name text, team_name text, vote_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not (select public.is_current_user_organizer()) then
    raise exception 'Only organisers can view People''s Choice results' using errcode = '42501';
  end if;
  if coalesce((select s.voting_open from public.people_choice_settings s where s.event_id = p_event_id), false) then
    raise exception 'Close voting before viewing the result tally' using errcode = '55000';
  end if;
  return query
  select s.id, coalesce(s.project->>'name', 'Untitled project'),
    coalesce(s.team->>'name', 'Team'), count(v.voter_id)
  from public.people_choice_finalists f
  join public.submissions s on s.id = f.submission_id
  left join public.people_choice_votes v on v.event_id = f.event_id and v.submission_id = f.submission_id
  where f.event_id = p_event_id and s.event_id = p_event_id and s.status = 'ready'
  group by s.id, s.project, s.team
  order by count(v.voter_id) desc, lower(coalesce(s.project->>'name', ''));
end;
$$;

revoke all on function public.get_people_choice_status(text) from public, anon, authenticated;
revoke all on function public.get_people_choice_finalists(text) from public, anon, authenticated;
revoke all on function public.cast_people_choice_vote(uuid, text) from public, anon, authenticated;
revoke all on function public.set_people_choice_finalists(uuid[], text) from public, anon, authenticated;
revoke all on function public.set_people_choice_voting(boolean, text) from public, anon, authenticated;
revoke all on function public.get_people_choice_results(text) from public, anon, authenticated;
grant execute on function public.get_people_choice_status(text) to authenticated;
grant execute on function public.get_people_choice_finalists(text) to authenticated;
grant execute on function public.cast_people_choice_vote(uuid, text) to authenticated;
grant execute on function public.set_people_choice_finalists(uuid[], text) to authenticated;
grant execute on function public.set_people_choice_voting(boolean, text) to authenticated;
grant execute on function public.get_people_choice_results(text) to authenticated;
