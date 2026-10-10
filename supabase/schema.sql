-- Common Ground central submissions
-- Run this in Supabase SQL Editor. Add organiser emails and builder emails as described in README.
create table if not exists public.organizers (
  email text primary key check (email = lower(trim(email)))
);

create table if not exists public.eligible_participants (
  email text primary key check (email = lower(trim(email)))
);

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  event_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  owner_email text not null,
  status text not null default 'draft' check (status in ('draft', 'ready')),
  project jsonb not null default '{}'::jsonb,
  team jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, user_id),
  constraint ready_submission_complete check (
    status <> 'ready' or (
      nullif(trim(project->>'name'), '') is not null
      and (case when jsonb_typeof(project->'tracks') = 'array' then jsonb_array_length(project->'tracks') between 1 and 2 else false end)
      and project->'tracks' <@ '["Design × Tech","Culture × Tech","Best Use of Tech","Common Ground Award"]'::jsonb
      and nullif(trim(project->>'oneLiner'), '') is not null
      and nullif(trim(project->>'inspiration'), '') is not null
      and nullif(trim(project->>'solution'), '') is not null
      and nullif(trim(project->>'interesting'), '') is not null
      and nullif(trim(project->>'technology'), '') is not null
      and nullif(trim(project->>'made'), '') is not null
      and nullif(trim(project->>'experiment'), '') is not null
      and nullif(trim(project->>'next'), '') is not null
      and (coalesce(project->>'demo', '') ~* '^https?://' or coalesce(project->>'video', '') ~* '^https?://')
      and (coalesce((project->>'noCode')::boolean, false) or coalesce(project->>'source', '') ~* '^https?://')
      and (not (project->'tracks' ? 'Design × Tech') or nullif(trim(project->>'designReflection'), '') is not null)
      and (not (project->'tracks' ? 'Culture × Tech') or nullif(trim(project->>'cultureReflection'), '') is not null)
      and nullif(trim(project->>'collaboration'), '') is not null
      and nullif(trim(project->>'attribution'), '') is not null
      and nullif(trim(team->>'name'), '') is not null
    )
  )
);

-- Reapply readiness checks when the schema is rerun on an existing project.
alter table public.submissions drop constraint if exists ready_submission_complete;
alter table public.submissions add constraint ready_submission_complete check (
  status <> 'ready' or (
    nullif(trim(project->>'name'), '') is not null
    and (case when jsonb_typeof(project->'tracks') = 'array' then jsonb_array_length(project->'tracks') between 1 and 2 else false end)
    and project->'tracks' <@ '["Design × Tech","Culture × Tech","Best Use of Tech","Common Ground Award"]'::jsonb
    and nullif(trim(project->>'oneLiner'), '') is not null
    and nullif(trim(project->>'inspiration'), '') is not null
    and nullif(trim(project->>'solution'), '') is not null
    and nullif(trim(project->>'interesting'), '') is not null
    and nullif(trim(project->>'technology'), '') is not null
    and nullif(trim(project->>'made'), '') is not null
    and nullif(trim(project->>'experiment'), '') is not null
    and nullif(trim(project->>'next'), '') is not null
    and (coalesce(project->>'demo', '') ~* '^https?://' or coalesce(project->>'video', '') ~* '^https?://')
    and (coalesce((project->>'noCode')::boolean, false) or coalesce(project->>'source', '') ~* '^https?://')
    and (not (project->'tracks' ? 'Design × Tech') or nullif(trim(project->>'designReflection'), '') is not null)
    and (not (project->'tracks' ? 'Culture × Tech') or nullif(trim(project->>'cultureReflection'), '') is not null)
    and nullif(trim(project->>'collaboration'), '') is not null
    and nullif(trim(project->>'attribution'), '') is not null
    and nullif(trim(team->>'name'), '') is not null
  )
);

alter table public.organizers enable row level security;
alter table public.eligible_participants enable row level security;
alter table public.submissions enable row level security;

revoke all on public.organizers, public.eligible_participants from anon, authenticated;
revoke all on public.submissions from anon;
grant select, insert, update on public.submissions to authenticated;

create or replace function public.is_current_user_organizer()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organizers o
    where o.email = lower(coalesce((select auth.jwt() ->> 'email'), ''))
  );
$$;

create or replace function public.is_current_user_eligible()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.eligible_participants p
    where p.email = lower(coalesce((select auth.jwt() ->> 'email'), ''))
  );
$$;

revoke all on function public.is_current_user_organizer() from public, anon;
revoke all on function public.is_current_user_eligible() from public, anon;
grant execute on function public.is_current_user_organizer() to authenticated;
grant execute on function public.is_current_user_eligible() to authenticated;

drop policy if exists submissions_read_own_or_organizer on public.submissions;
create policy submissions_read_own_or_organizer
on public.submissions for select to authenticated
using (user_id = (select auth.uid()) or (select public.is_current_user_organizer()));

drop policy if exists submissions_insert_eligible_owner on public.submissions;
create policy submissions_insert_eligible_owner
on public.submissions for insert to authenticated
with check (
  user_id = (select auth.uid())
  and event_id = 'common-ground-2026-10-11'
  and owner_email = lower(coalesce((select auth.jwt() ->> 'email'), ''))
  and (select public.is_current_user_eligible())
);

drop policy if exists submissions_update_own_or_organizer on public.submissions;
create policy submissions_update_own_or_organizer
on public.submissions for update to authenticated
using (user_id = (select auth.uid()) or (select public.is_current_user_organizer()))
with check (
  (user_id = (select auth.uid())
   and event_id = 'common-ground-2026-10-11'
   and owner_email = lower(coalesce((select auth.jwt() ->> 'email'), ''))
   and (select public.is_current_user_eligible()))
  or (select public.is_current_user_organizer())
);

create index if not exists submissions_event_status_updated_idx
on public.submissions (event_id, status, updated_at desc);

-- A normalized team name identifies a single team submission for the event.
create unique index if not exists submissions_one_entry_per_team_idx
on public.submissions (event_id, lower(trim(team->>'name')))
where nullif(trim(team->>'name'), '') is not null;

-- Private first-come-first-served inventory for tool codes.
-- Code URLs stay out of GitHub and are claimed through an authenticated RPC.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.tool_code_inventory (
  id bigint generated by default as identity primary key,
  tool text not null check (tool in ('openai', 'figma', 'mobbin')),
  code_value text not null,
  claimed_by uuid references auth.users(id) on delete set null,
  claimed_at timestamptz,
  unique (tool, claimed_by)
);
alter table private.tool_code_inventory enable row level security;
revoke all on private.tool_code_inventory from public, anon, authenticated;
create index if not exists tool_code_inventory_unclaimed_idx on private.tool_code_inventory (tool, id) where claimed_by is null;

create or replace function public.claim_tool_code(p_tool text)
returns table (available boolean, code_value text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code_value text;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in is required to claim a code' using errcode = '28000';
  end if;

  if p_tool is null or p_tool not in ('openai', 'figma', 'mobbin') then
    raise exception 'Unknown code pool' using errcode = '22023';
  end if;

  if not (select public.is_current_user_eligible()) then
    raise exception 'This email is not on the approved builder list' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('common-ground-tool-code:' || p_tool)::bigint);

  select inventory.code_value into v_code_value
  from private.tool_code_inventory as inventory
  where inventory.tool = p_tool and inventory.claimed_by = (select auth.uid());

  if found then
    return query select true, v_code_value;
    return;
  end if;

  with next_code as (
    select inventory.id
    from private.tool_code_inventory as inventory
    where inventory.tool = p_tool and inventory.claimed_by is null
    order by inventory.id
    limit 1
    for update
  )
  update private.tool_code_inventory as inventory
  set claimed_by = (select auth.uid()), claimed_at = pg_catalog.now()
  from next_code
  where inventory.id = next_code.id
  returning inventory.code_value into v_code_value;

  return query select v_code_value is not null, v_code_value;
end;
$$;

revoke all on function public.claim_tool_code(text) from public, anon, authenticated;
grant execute on function public.claim_tool_code(text) to authenticated;

-- People’s Choice tables and controlled RPCs.
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
