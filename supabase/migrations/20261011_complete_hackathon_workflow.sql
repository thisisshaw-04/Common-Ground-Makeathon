-- Complete the Common Ground submission and judging workflow.
-- Apply after the existing supabase/schema.sql has been run.
-- The live project already has the guarded People’s Choice tables and RPCs.

alter table public.submissions
  drop constraint if exists ready_submission_complete;

alter table public.submissions
  add constraint ready_submission_complete check (
    status <> 'ready'
    or (
      nullif(trim(project->>'name'), '') is not null
      and nullif(trim(project->>'description'), '') is not null
      and nullif(trim(team->>'name'), '') is not null
      and case
        when jsonb_typeof(project->'tracks') = 'array'
          then jsonb_array_length(project->'tracks') between 1 and 2
        else false
      end
      and project->'tracks' <@ '["design_tech","culture_tech","best_use_of_tech","common_ground"]'::jsonb
      and nullif(trim(project->>'oneLiner'), '') is not null
      and nullif(trim(project->>'inspiration'), '') is not null
      and nullif(trim(project->>'solution'), '') is not null
      and nullif(trim(project->>'interesting'), '') is not null
      and array_length(regexp_split_to_array(btrim(concat_ws(' ',
        project->>'oneLiner', project->>'inspiration', project->>'solution', project->>'interesting'
      )), '[[:space:]]+'), 1) <= 100
      and nullif(trim(project->>'technology'), '') is not null
      and nullif(trim(project->>'currentBuild'), '') is not null
      and nullif(trim(project->>'experiment'), '') is not null
      and nullif(trim(project->>'nextSteps'), '') is not null
      and array_length(regexp_split_to_array(btrim(concat_ws(' ',
        project->>'technology', project->>'currentBuild', project->>'experiment', project->>'nextSteps'
      )), '[[:space:]]+'), 1) <= 100
      and (
        not (project->'tracks' ? 'design_tech')
        or nullif(trim(project->>'designReflection'), '') is not null
      )
      and (
        not (project->'tracks' ? 'culture_tech')
        or nullif(trim(project->>'cultureReflection'), '') is not null
      )
      and nullif(trim(team->>'collaboration'), '') is not null
      and nullif(trim(project->>'aiTools'), '') is not null
      and nullif(trim(project->>'thirdParty'), '') is not null
      and (
        coalesce(project->>'sourceIsCode', 'true') <> 'true'
        or coalesce(project->>'source', '') ~* '^https?://'
      )
      and (
        coalesce(project->>'demo', '') ~* '^https?://'
        or coalesce(project->>'video', '') ~* '^https?://'
        or coalesce(project->>'source', '') ~* '^https?://'
        or coalesce(project->>'prototype', '') ~* '^https?://'
        or case
          when jsonb_typeof(project->'supportingMaterials') = 'array'
            then jsonb_array_length(project->'supportingMaterials') > 0
          else false
        end
      )
      and case
        when jsonb_typeof(team->'members') = 'array'
          then jsonb_array_length(team->'members') > 0
        else false
      end
    )
  );

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

drop policy if exists submission_scores_organizer_read on public.submission_scores;
create policy submission_scores_organizer_read
  on public.submission_scores for select to authenticated
  using ((select public.is_current_user_organizer()));

drop policy if exists submission_scores_organizer_insert on public.submission_scores;
create policy submission_scores_organizer_insert
  on public.submission_scores for insert to authenticated
  with check (
    judge_id = (select auth.uid())
    and (select public.is_current_user_organizer())
  );

drop policy if exists submission_scores_organizer_update on public.submission_scores;
create policy submission_scores_organizer_update
  on public.submission_scores for update to authenticated
  using (
    judge_id = (select auth.uid())
    and (select public.is_current_user_organizer())
  )
  with check (
    judge_id = (select auth.uid())
    and (select public.is_current_user_organizer())
  );

create index if not exists submission_scores_judge_idx
  on public.submission_scores (judge_id, submission_id);

-- Safe attendee gallery: expose ready project fields only, never emails, drafts, or judge notes.
create or replace function public.get_ready_project_gallery(p_event_id text default 'common-ground-2026-10-11')
returns table (
  submission_id uuid,
  project_name text,
  team_name text,
  tracks jsonb,
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
as $function$
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in is required to view projects' using errcode = '28000';
  end if;
  if not (select public.is_current_user_eligible()) then
    raise exception 'Only approved attendees can view projects' using errcode = '42501';
  end if;
  return query
  select
    s.id,
    coalesce(s.project->>'name', 'Untitled project'),
    coalesce(s.team->>'name', 'Team'),
    coalesce(s.project->'tracks', '[]'::jsonb),
    coalesce(s.project->>'oneLiner', ''),
    concat_ws(' ',
      nullif(s.project->>'inspiration', ''),
      nullif(s.project->>'solution', ''),
      nullif(s.project->>'interesting', '')
    ),
    concat_ws(' · ',
      nullif(s.project->>'technology', ''),
      nullif(s.project->>'currentBuild', ''),
      nullif(s.project->>'experiment', ''),
      nullif(s.project->>'nextSteps', '')
    ),
    coalesce(s.project->>'demo', ''),
    coalesce(s.project->>'video', ''),
    coalesce(s.project->>'source', ''),
    coalesce(s.project->>'prototype', '')
  from public.submissions s
  where s.event_id = p_event_id and s.status = 'ready'
  order by lower(coalesce(s.project->>'name', '')), lower(coalesce(s.team->>'name', ''));
end;
$function$;

revoke all on function public.get_ready_project_gallery(text) from public, anon, authenticated;
grant execute on function public.get_ready_project_gallery(text) to authenticated;
