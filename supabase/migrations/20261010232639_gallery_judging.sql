-- Ready project gallery and private organiser judging scores.
-- Additive migration: it does not alter attendee, submission, or voting records.

create table if not exists public.submission_scores (
  submission_id uuid not null references public.submissions(id) on delete cascade,
  judge_id uuid not null references auth.users(id) on delete cascade,
  concept smallint not null check (concept between 1 and 5),
  track_fit smallint not null check (track_fit between 1 and 5),
  execution smallint not null check (execution between 1 and 5),
  presentation smallint not null check (presentation between 1 and 5),
  notes text not null default '',
  updated_at timestamptz not null default now(),
  primary key (submission_id, judge_id)
);

alter table public.submission_scores enable row level security;
revoke all on public.submission_scores from public, anon;
grant select, insert, update on public.submission_scores to authenticated;

drop policy if exists submission_scores_read_organizers on public.submission_scores;
create policy submission_scores_read_organizers
on public.submission_scores for select to authenticated
using ((select public.is_current_user_organizer()));

drop policy if exists submission_scores_insert_organizer_own on public.submission_scores;
create policy submission_scores_insert_organizer_own
on public.submission_scores for insert to authenticated
with check (
  (select public.is_current_user_organizer())
  and judge_id = (select auth.uid())
  and exists (
    select 1 from public.submissions s
    where s.id = submission_id
      and s.event_id = 'common-ground-2026-10-11'
      and s.status = 'ready'
  )
);

drop policy if exists submission_scores_update_organizer_own on public.submission_scores;
create policy submission_scores_update_organizer_own
on public.submission_scores for update to authenticated
using (
  (select public.is_current_user_organizer())
  and judge_id = (select auth.uid())
  and exists (
    select 1 from public.submissions s
    where s.id = submission_id
      and s.event_id = 'common-ground-2026-10-11'
      and s.status = 'ready'
  )
)
with check (
  (select public.is_current_user_organizer())
  and judge_id = (select auth.uid())
  and exists (
    select 1 from public.submissions s
    where s.id = submission_id
      and s.event_id = 'common-ground-2026-10-11'
      and s.status = 'ready'
  )
);

create or replace function public.get_ready_project_gallery(
  p_event_id text default 'common-ground-2026-10-11'
)
returns table (
  submission_id uuid,
  project_name text,
  team_name text,
  tracks text[],
  one_liner text,
  project_overview text,
  build_summary text,
  demo_url text,
  video_url text,
  source_url text,
  prototype_url text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_event_id is distinct from 'common-ground-2026-10-11' then
    raise exception 'This gallery is not available.' using errcode = '22023';
  end if;
  if (select auth.uid()) is null or not public.is_current_user_eligible() then
    raise exception 'Eligible attendee access is required.'
      using errcode = '42501';
  end if;

  return query
  select
    s.id,
    s.project ->> 'name',
    s.team ->> 'name',
    array(select jsonb_array_elements_text(s.project -> 'tracks')),
    s.project ->> 'oneLiner',
    concat_ws(E'\n\n',
      case when nullif(trim(s.project ->> 'inspiration'), '') is not null then 'Inspiration: ' || (s.project ->> 'inspiration') end,
      case when nullif(trim(s.project ->> 'solution'), '') is not null then 'What they built: ' || (s.project ->> 'solution') end,
      case when nullif(trim(s.project ->> 'interesting'), '') is not null then 'What is interesting: ' || (s.project ->> 'interesting') end
    ),
    concat_ws(E'\n\n',
      case when nullif(trim(s.project ->> 'technology'), '') is not null then 'Technology: ' || (s.project ->> 'technology') end,
      case when nullif(trim(s.project ->> 'made'), '') is not null then 'What works now: ' || (s.project ->> 'made') end,
      case when nullif(trim(s.project ->> 'experiment'), '') is not null then 'What they explored: ' || (s.project ->> 'experiment') end,
      case when nullif(trim(s.project ->> 'next'), '') is not null then 'Next: ' || (s.project ->> 'next') end
    ),
    nullif(s.project ->> 'demo', ''),
    nullif(s.project ->> 'video', ''),
    nullif(s.project ->> 'source', ''),
    nullif(s.project ->> 'prototype', '')
  from public.submissions s
  where s.event_id = p_event_id
    and s.status = 'ready'
  order by s.updated_at desc, s.id;
end;
$$;

revoke all on function public.get_ready_project_gallery(text) from public, anon;
grant execute on function public.get_ready_project_gallery(text) to authenticated;
