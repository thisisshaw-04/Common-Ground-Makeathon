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
      and nullif(trim(project->>'description'), '') is not null
      and (
        coalesce(project->>'demo', '') ~* '^https?://'
        or coalesce(project->>'source', '') ~* '^https?://'
      )
      and nullif(trim(team->>'name'), '') is not null
    )
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
  and owner_email = lower(coalesce((select auth.jwt() ->> 'email'), ''))
  and (select public.is_current_user_eligible())
);

drop policy if exists submissions_update_own_or_organizer on public.submissions;
create policy submissions_update_own_or_organizer
on public.submissions for update to authenticated
using (user_id = (select auth.uid()) or (select public.is_current_user_organizer()))
with check (
  (user_id = (select auth.uid())
   and owner_email = lower(coalesce((select auth.jwt() ->> 'email'), ''))
   and (select public.is_current_user_eligible()))
  or (select public.is_current_user_organizer())
);

create index if not exists submissions_event_status_updated_idx
on public.submissions (event_id, status, updated_at desc);
