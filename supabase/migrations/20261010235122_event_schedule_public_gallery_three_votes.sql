-- Enforce the event deadline in Postgres and move People’s Choice to a public,
-- up-to-three-project ballot that opens automatically when submissions close.

alter table public.people_choice_settings
  add column if not exists voting_paused boolean not null default false;

insert into public.people_choice_settings (event_id, voting_open, voting_paused)
values ('common-ground-2026-10-11', false, false)
on conflict (event_id) do nothing;

-- Ballots now allow up to three distinct projects per attendee.
alter table public.people_choice_votes
  drop constraint if exists people_choice_votes_event_id_submission_id_fkey;
alter table public.people_choice_votes
  drop constraint if exists people_choice_votes_pkey;
alter table public.people_choice_votes
  add constraint people_choice_votes_pkey primary key (event_id, voter_id, submission_id);
alter table public.people_choice_votes
  add constraint people_choice_votes_submission_id_fkey
  foreign key (submission_id) references public.submissions(id) on delete cascade;
create index if not exists people_choice_votes_event_submission_idx
  on public.people_choice_votes (event_id, submission_id);

-- Serialize concurrent votes by the same signed-in account before counting them.
create table if not exists public.people_choice_voter_locks (
  event_id text not null,
  voter_id uuid not null references auth.users(id) on delete cascade,
  primary key (event_id, voter_id)
);
alter table public.people_choice_voter_locks enable row level security;
revoke all on table public.people_choice_voter_locks from public, anon, authenticated;
revoke all on table public.people_choice_votes from public, anon, authenticated;

-- Submission readiness, word limits, and the 3:15 PM SGT close are also enforced
-- server-side, even when a client bypasses the website.
create or replace function public.common_ground_submission_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
    v_overview := pg_catalog.concat_ws(' ',
      new.project ->> 'oneLiner',
      new.project ->> 'inspiration',
      new.project ->> 'solution',
      new.project ->> 'interesting'
    );
    v_build := pg_catalog.concat_ws(' ',
      new.project ->> 'technology',
      new.project ->> 'made',
      new.project ->> 'experiment',
      new.project ->> 'next'
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
$$;

revoke all on function public.common_ground_submission_guard() from public, anon, authenticated;

drop trigger if exists common_ground_submission_guard on public.submissions;
create trigger common_ground_submission_guard
before insert or update or delete on public.submissions
for each row execute function public.common_ground_submission_guard();

-- One safe, server-timed status row drives the timeline, submission lock,
-- public gallery opening, and automatic voting window.
create or replace function public.get_common_ground_event_state()
returns table (
  current_at timestamptz,
  submissions_closed boolean,
  gallery_open boolean,
  voting_open boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_paused boolean;
begin
  select coalesce(s.voting_paused, false) into v_paused
  from public.people_choice_settings s
  where s.event_id = 'common-ground-2026-10-11';

  return query select
    v_now,
    v_now >= timestamptz '2026-10-11 15:15:00+08',
    v_now >= timestamptz '2026-10-11 15:15:00+08',
    v_now >= timestamptz '2026-10-11 15:15:00+08'
      and v_now < timestamptz '2026-10-11 17:00:00+08'
      and not coalesce(v_paused, false);
end;
$$;
revoke all on function public.get_common_ground_event_state() from public, anon, authenticated;
grant execute on function public.get_common_ground_event_state() to anon, authenticated;

-- Replace the former attendee-only gallery RPC with a safe public gallery
-- that only opens after the submission deadline.
drop function if exists public.get_ready_project_gallery(text);
create function public.get_ready_project_gallery(p_event_id text default 'common-ground-2026-10-11')
returns table (
  submission_id uuid,
  project_name text,
  team_name text,
  team_members text[],
  tracks text[],
  one_liner text,
  project_overview text,
  build_summary text,
  design_reflection text,
  culture_reflection text,
  team_collaboration text,
  ai_attribution text,
  supporting_materials text,
  demo_url text,
  video_url text,
  source_url text,
  prototype_url text,
  is_my_team boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_email text := pg_catalog.lower(pg_catalog.btrim(coalesce(auth.jwt() ->> 'email', '')));
begin
  if p_event_id is distinct from 'common-ground-2026-10-11' then
    raise exception 'This gallery is not available.' using errcode = '22023';
  end if;
  if v_now < timestamptz '2026-10-11 15:15:00+08' then
    raise exception 'The project gallery opens at 3:15 PM SGT.' using errcode = '55000';
  end if;

  return query
  select
    s.id,
    s.project ->> 'name',
    s.team ->> 'name',
    array(
      select pg_catalog.btrim(m.member ->> 'name')
      from pg_catalog.jsonb_array_elements(
        case when pg_catalog.jsonb_typeof(s.team -> 'members') = 'array'
          then s.team -> 'members' else '[]'::jsonb end
      ) as m(member)
      where nullif(pg_catalog.btrim(m.member ->> 'name'), '') is not null
    ),
    case when pg_catalog.jsonb_typeof(s.project -> 'tracks') = 'array'
      then array(select pg_catalog.jsonb_array_elements_text(s.project -> 'tracks'))
      else array[]::text[] end,
    s.project ->> 'oneLiner',
    pg_catalog.concat_ws(E'\n\n',
      case when nullif(pg_catalog.btrim(s.project ->> 'inspiration'), '') is not null then 'Inspiration: ' || (s.project ->> 'inspiration') end,
      case when nullif(pg_catalog.btrim(s.project ->> 'solution'), '') is not null then 'What they built: ' || (s.project ->> 'solution') end,
      case when nullif(pg_catalog.btrim(s.project ->> 'interesting'), '') is not null then 'What is interesting: ' || (s.project ->> 'interesting') end
    ),
    pg_catalog.concat_ws(E'\n\n',
      case when nullif(pg_catalog.btrim(s.project ->> 'technology'), '') is not null then 'Technology: ' || (s.project ->> 'technology') end,
      case when nullif(pg_catalog.btrim(s.project ->> 'made'), '') is not null then 'What works now: ' || (s.project ->> 'made') end,
      case when nullif(pg_catalog.btrim(s.project ->> 'experiment'), '') is not null then 'What they explored: ' || (s.project ->> 'experiment') end,
      case when nullif(pg_catalog.btrim(s.project ->> 'next'), '') is not null then 'Next: ' || (s.project ->> 'next') end
    ),
    s.project ->> 'designReflection',
    s.project ->> 'cultureReflection',
    s.project ->> 'collaboration',
    s.project ->> 'attribution',
    s.project ->> 'supporting',
    nullif(s.project ->> 'demo', ''),
    nullif(s.project ->> 'video', ''),
    nullif(s.project ->> 'source', ''),
    nullif(s.project ->> 'prototype', ''),
    (
      (select auth.uid()) is not null and (
        s.user_id = (select auth.uid())
        or pg_catalog.lower(pg_catalog.btrim(coalesce(s.owner_email, ''))) = v_email
        or exists (
          select 1
          from pg_catalog.jsonb_array_elements(
            case when pg_catalog.jsonb_typeof(s.team -> 'members') = 'array'
              then s.team -> 'members' else '[]'::jsonb end
          ) as m(member)
          where pg_catalog.lower(pg_catalog.btrim(coalesce(m.member ->> 'email', ''))) = v_email
        )
      )
    )
  from public.submissions s
  where s.event_id = 'common-ground-2026-10-11'
    and s.status = 'ready'
  order by s.updated_at, s.id;
end;
$$;
revoke all on function public.get_ready_project_gallery(text) from public, anon, authenticated;
grant execute on function public.get_ready_project_gallery(text) to anon, authenticated;

-- The authenticated attendee can see their three-ballot status, never ballot identities.
drop function if exists public.get_people_choice_status(text);
create function public.get_people_choice_status(p_event_id text default 'common-ground-2026-10-11')
returns table (
  voting_open boolean,
  votes_cast integer,
  voted_submission_ids uuid[]
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_paused boolean;
  v_voter uuid := (select auth.uid());
begin
  if p_event_id is distinct from 'common-ground-2026-10-11' then
    raise exception 'This ballot is not available.' using errcode = '22023';
  end if;
  if v_voter is null then
    raise exception 'Sign in is required to vote.' using errcode = '28000';
  end if;
  if not (select public.is_current_user_eligible()) then
    raise exception 'Only approved attendees can vote.' using errcode = '42501';
  end if;
  select coalesce(s.voting_paused, false) into v_paused
  from public.people_choice_settings s where s.event_id = p_event_id;

  return query
  select
    v_now >= timestamptz '2026-10-11 15:15:00+08'
      and v_now < timestamptz '2026-10-11 17:00:00+08'
      and not coalesce(v_paused, false),
    count(v.submission_id)::integer,
    coalesce(pg_catalog.array_agg(v.submission_id) filter (where v.submission_id is not null), array[]::uuid[])
  from public.people_choice_votes v
  where v.event_id = p_event_id and v.voter_id = v_voter;
end;
$$;
revoke all on function public.get_people_choice_status(text) from public, anon, authenticated;
grant execute on function public.get_people_choice_status(text) to authenticated;

create or replace function public.cast_people_choice_vote(
  p_submission_id uuid,
  p_event_id text default 'common-ground-2026-10-11'
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_paused boolean;
  v_voter uuid := (select auth.uid());
  v_email text := pg_catalog.lower(pg_catalog.btrim(coalesce(auth.jwt() ->> 'email', '')));
begin
  if p_event_id is distinct from 'common-ground-2026-10-11' then
    raise exception 'This ballot is not available.' using errcode = '22023';
  end if;
  if v_voter is null then
    raise exception 'Sign in is required to vote.' using errcode = '28000';
  end if;
  if not (select public.is_current_user_eligible()) then
    raise exception 'Only approved attendees can vote.' using errcode = '42501';
  end if;
  if v_now < timestamptz '2026-10-11 15:15:00+08'
     or v_now >= timestamptz '2026-10-11 17:00:00+08' then
    raise exception 'People’s Choice voting is open from 3:15 PM to 5:00 PM SGT.'
      using errcode = '55000';
  end if;
  select coalesce(s.voting_paused, false) into v_paused
  from public.people_choice_settings s where s.event_id = p_event_id;
  if coalesce(v_paused, false) then
    raise exception 'Voting is paused by the organisers.' using errcode = '55000';
  end if;

  if not exists (
    select 1 from public.submissions s
    where s.id = p_submission_id and s.event_id = p_event_id and s.status = 'ready'
  ) then
    raise exception 'That project is not available for voting.' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.submissions s
    where s.id = p_submission_id and s.event_id = p_event_id
      and (
        s.user_id = v_voter
        or pg_catalog.lower(pg_catalog.btrim(coalesce(s.owner_email, ''))) = v_email
        or exists (
          select 1
          from pg_catalog.jsonb_array_elements(
            case when pg_catalog.jsonb_typeof(s.team -> 'members') = 'array'
              then s.team -> 'members' else '[]'::jsonb end
          ) as m(member)
          where pg_catalog.lower(pg_catalog.btrim(coalesce(m.member ->> 'email', ''))) = v_email
        )
      )
  ) then
    raise exception 'You cannot vote for your own team.' using errcode = '42501';
  end if;

  insert into public.people_choice_voter_locks(event_id, voter_id)
  values (p_event_id, v_voter)
  on conflict (event_id, voter_id) do nothing;
  perform 1 from public.people_choice_voter_locks l
  where l.event_id = p_event_id and l.voter_id = v_voter
  for update;

  if exists (
    select 1 from public.people_choice_votes v
    where v.event_id = p_event_id and v.voter_id = v_voter and v.submission_id = p_submission_id
  ) then
    raise exception 'You already voted for this project.' using errcode = '23505';
  end if;
  if (select count(*) from public.people_choice_votes v
      where v.event_id = p_event_id and v.voter_id = v_voter) >= 3 then
    raise exception 'You have already used all three votes.' using errcode = '23514';
  end if;

  insert into public.people_choice_votes(event_id, voter_id, submission_id)
  values (p_event_id, v_voter, p_submission_id);
  return true;
end;
$$;
revoke all on function public.cast_people_choice_vote(uuid, text) from public, anon, authenticated;
grant execute on function public.cast_people_choice_vote(uuid, text) to authenticated;

-- Organisers can pause a live ballot, resume it during the voting window, and
-- view aggregate totals once voting is closed.
create or replace function public.set_people_choice_voting(
  p_open boolean,
  p_event_id text default 'common-ground-2026-10-11'
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if p_event_id is distinct from 'common-ground-2026-10-11' then
    raise exception 'This ballot is not available.' using errcode = '22023';
  end if;
  if (select auth.uid()) is null or not (select public.is_current_user_organizer()) then
    raise exception 'Only organisers can change voting controls.' using errcode = '42501';
  end if;
  if coalesce(p_open, false) and
     (v_now < timestamptz '2026-10-11 15:15:00+08' or v_now >= timestamptz '2026-10-11 17:00:00+08') then
    raise exception 'Voting runs from 3:15 PM to 5:00 PM SGT.' using errcode = '55000';
  end if;

  insert into public.people_choice_settings(event_id, voting_open, voting_paused, updated_at, updated_by)
  values (p_event_id, coalesce(p_open, false), not coalesce(p_open, false), pg_catalog.clock_timestamp(), (select auth.uid()))
  on conflict(event_id) do update set
    voting_open = excluded.voting_open,
    voting_paused = excluded.voting_paused,
    updated_at = excluded.updated_at,
    updated_by = excluded.updated_by;
  return coalesce(p_open, false);
end;
$$;
revoke all on function public.set_people_choice_voting(boolean, text) from public, anon, authenticated;
grant execute on function public.set_people_choice_voting(boolean, text) to authenticated;

drop function if exists public.get_people_choice_admin_status(text);
create function public.get_people_choice_admin_status(p_event_id text default 'common-ground-2026-10-11')
returns table (
  voting_open boolean,
  voting_paused boolean,
  ready_project_count integer,
  vote_count bigint
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_paused boolean;
begin
  if p_event_id is distinct from 'common-ground-2026-10-11' then
    raise exception 'This ballot is not available.' using errcode = '22023';
  end if;
  if (select auth.uid()) is null or not (select public.is_current_user_organizer()) then
    raise exception 'Only organisers can view voting controls.' using errcode = '42501';
  end if;
  select coalesce(s.voting_paused, false) into v_paused
  from public.people_choice_settings s where s.event_id = p_event_id;
  return query select
    v_now >= timestamptz '2026-10-11 15:15:00+08'
      and v_now < timestamptz '2026-10-11 17:00:00+08'
      and not coalesce(v_paused, false),
    coalesce(v_paused, false),
    (select count(*)::integer from public.submissions s where s.event_id = p_event_id and s.status = 'ready'),
    (select count(*)::bigint from public.people_choice_votes v where v.event_id = p_event_id);
end;
$$;
revoke all on function public.get_people_choice_admin_status(text) from public, anon, authenticated;
grant execute on function public.get_people_choice_admin_status(text) to authenticated;

create or replace function public.get_people_choice_results(p_event_id text default 'common-ground-2026-10-11')
returns table (
  submission_id uuid,
  project_name text,
  team_name text,
  vote_count bigint
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_paused boolean;
begin
  if p_event_id is distinct from 'common-ground-2026-10-11' then
    raise exception 'This ballot is not available.' using errcode = '22023';
  end if;
  if (select auth.uid()) is null or not (select public.is_current_user_organizer()) then
    raise exception 'Only organisers can view People’s Choice results.' using errcode = '42501';
  end if;
  select coalesce(s.voting_paused, false) into v_paused
  from public.people_choice_settings s where s.event_id = p_event_id;
  if v_now < timestamptz '2026-10-11 15:15:00+08'
     or (v_now < timestamptz '2026-10-11 17:00:00+08' and not coalesce(v_paused, false)) then
    raise exception 'Results are available after voting closes.' using errcode = '55000';
  end if;
  return query
  select s.id, coalesce(s.project ->> 'name', 'Untitled project'),
    coalesce(s.team ->> 'name', 'Team'), count(v.voter_id)
  from public.submissions s
  left join public.people_choice_votes v
    on v.event_id = p_event_id and v.submission_id = s.id
  where s.event_id = p_event_id and s.status = 'ready'
  group by s.id, s.project, s.team
  order by count(v.voter_id) desc, pg_catalog.lower(coalesce(s.project ->> 'name', ''));
end;
$$;
revoke all on function public.get_people_choice_results(text) from public, anon, authenticated;
grant execute on function public.get_people_choice_results(text) to authenticated;

notify pgrst, 'reload schema';
