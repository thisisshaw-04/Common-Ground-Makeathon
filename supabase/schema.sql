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
    and cardinality(regexp_split_to_array(btrim(concat_ws(' ', project->>'oneLiner', project->>'inspiration', project->>'solution', project->>'interesting')), '\s+')) <= 100
      and cardinality(regexp_split_to_array(btrim(concat_ws(' ', project->>'oneLiner', project->>'inspiration', project->>'solution', project->>'interesting')), '\s+')) <= 100
      and nullif(trim(project->>'technology'), '') is not null
      and nullif(trim(project->>'made'), '') is not null
      and nullif(trim(project->>'experiment'), '') is not null
      and nullif(trim(project->>'next'), '') is not null
    and cardinality(regexp_split_to_array(btrim(concat_ws(' ', project->>'technology', project->>'made', project->>'experiment', project->>'next')), '\s+')) <= 100
      and cardinality(regexp_split_to_array(btrim(concat_ws(' ', project->>'technology', project->>'made', project->>'experiment', project->>'next')), '\s+')) <= 100
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
