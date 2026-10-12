-- Allow organisers to test People’s Choice voting before the public opening.
--
-- Public voting remains scheduled for 6:00 PM SGT; only authenticated organisers
-- can use the early override. Vote rows are not changed.

CREATE OR REPLACE FUNCTION public.cast_people_choice_vote(p_submission_id uuid, p_event_id text DEFAULT 'common-ground-2026-10-11'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_paused boolean;
  v_voter uuid := (select auth.uid());
  v_email text := pg_catalog.lower(pg_catalog.btrim(coalesce(auth.jwt() ->> 'email', '')));
  v_email_verified boolean := false;
  v_is_builder boolean := false;
  v_is_organizer boolean := false;
  v_vote_limit integer;
begin
  if p_event_id is distinct from 'common-ground-2026-10-11' then
    raise exception 'This ballot is not available.' using errcode = '22023';
  end if;
  if v_voter is null then
    raise exception 'Sign in is required to vote.' using errcode = '28000';
  end if;
  select u.email_confirmed_at is not null
    into v_email_verified
  from auth.users as u
  where u.id = v_voter;
  if not coalesce(v_email_verified, false) or v_email = '' then
    raise exception 'A verified email sign-in is required to vote.' using errcode = '42501';
  end if;
  v_is_organizer := (select public.is_current_user_organizer());
  v_is_builder := (select public.is_current_user_eligible()) or v_is_organizer;
  v_vote_limit := case when v_is_builder then 3 else 1 end;
  if v_now >= timestamptz '2026-10-14 23:59:59+08'
     or (v_now < timestamptz '2026-10-12 18:00:00+08' and not (
       v_is_organizer and exists (
         select 1 from public.people_choice_settings s
         where s.event_id = p_event_id and coalesce(s.voting_open, false)
       )
     )) then
    raise exception 'People’s Choice voting opens at 6:00 PM Monday, 12 October; only organisers can vote before then. Voting ends at 11:59 PM Wednesday, 14 October SGT.'
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
      where v.event_id = p_event_id and v.voter_id = v_voter) >= v_vote_limit then
    if v_vote_limit = 1 then
      raise exception 'You have already used your one vote.' using errcode = '23514';
    end if;
    raise exception 'You have already used all three votes.' using errcode = '23514';
  end if;

  insert into public.people_choice_votes(event_id, voter_id, submission_id)
  values (p_event_id, v_voter, p_submission_id);
  return true;
end;
$function$


CREATE OR REPLACE FUNCTION public.remove_people_choice_vote(p_submission_id uuid, p_event_id text DEFAULT 'common-ground-2026-10-11'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_voter uuid := (select auth.uid());
  v_email text := pg_catalog.lower(pg_catalog.btrim(coalesce(auth.jwt() ->> 'email', '')));
  v_email_verified boolean := false;
  v_paused boolean;
  v_is_organizer boolean := false;
begin
  if p_event_id is distinct from 'common-ground-2026-10-11' then
    raise exception 'This ballot is not available.' using errcode = '22023';
  end if;
  if v_voter is null then
    raise exception 'Sign in is required to remove a vote.' using errcode = '28000';
  end if;
  select u.email_confirmed_at is not null
    into v_email_verified
  from auth.users as u
  where u.id = v_voter;
  if not coalesce(v_email_verified, false) or v_email = '' then
    raise exception 'A verified email sign-in is required to vote.' using errcode = '42501';
  end if;
  v_is_organizer := (select public.is_current_user_organizer());
  if v_now >= timestamptz '2026-10-14 23:59:59+08'
     or (v_now < timestamptz '2026-10-12 18:00:00+08' and not (
       v_is_organizer and exists (
         select 1 from public.people_choice_settings s
         where s.event_id = p_event_id and coalesce(s.voting_open, false)
       )
     )) then
    raise exception 'People’s Choice voting opens at 6:00 PM Monday, 12 October; only organisers can vote before then. Voting ends at 11:59 PM Wednesday, 14 October SGT.' using errcode = '55000';
  end if;

  select coalesce(settings.voting_paused, false) into v_paused
  from public.people_choice_settings as settings
  where settings.event_id = p_event_id;
  if coalesce(v_paused, false) then
    raise exception 'Voting is paused by the organisers.' using errcode = '55000';
  end if;

  insert into public.people_choice_voter_locks(event_id, voter_id)
  values (p_event_id, v_voter)
  on conflict (event_id, voter_id) do nothing;
  perform 1
  from public.people_choice_voter_locks as voter_lock
  where voter_lock.event_id = p_event_id
    and voter_lock.voter_id = v_voter
  for update;

  delete from public.people_choice_votes as vote
  where vote.event_id = p_event_id
    and vote.voter_id = v_voter
    and vote.submission_id = p_submission_id;
  if not found then
    raise exception 'You have not voted for this project.' using errcode = 'P0002';
  end if;

  return true;
end;
$function$


CREATE OR REPLACE FUNCTION public.get_people_choice_status(p_event_id text DEFAULT 'common-ground-2026-10-11'::text)
 RETURNS TABLE(voting_open boolean, votes_cast integer, voted_submission_ids uuid[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_paused boolean;
  v_voter uuid := (select auth.uid());
  v_email text := pg_catalog.lower(pg_catalog.btrim(coalesce(auth.jwt() ->> 'email', '')));
  v_email_verified boolean := false;
  v_is_organizer boolean := false;
  v_organizer_override boolean := false;
begin
  if p_event_id is distinct from 'common-ground-2026-10-11' then
    raise exception 'This ballot is not available.' using errcode = '22023';
  end if;
  if v_voter is null then
    raise exception 'Sign in is required to vote.' using errcode = '28000';
  end if;
  select u.email_confirmed_at is not null
    into v_email_verified
  from auth.users as u
  where u.id = v_voter;
  if not coalesce(v_email_verified, false) or v_email = '' then
    raise exception 'A verified email sign-in is required to vote.' using errcode = '42501';
  end if;
  select coalesce(s.voting_paused, false), coalesce(s.voting_open, false)
    into v_paused, v_organizer_override
  from public.people_choice_settings s where s.event_id = p_event_id;
  v_is_organizer := (select public.is_current_user_organizer());

  return query
  select
    v_now < timestamptz '2026-10-14 23:59:59+08'
      and not coalesce(v_paused, false)
      and (v_now >= timestamptz '2026-10-12 18:00:00+08'
        or (v_is_organizer and coalesce(v_organizer_override, false))),
    count(v.submission_id)::integer,
    coalesce(pg_catalog.array_agg(v.submission_id) filter (where v.submission_id is not null), array[]::uuid[])
  from public.people_choice_votes v
  where v.event_id = p_event_id and v.voter_id = v_voter;
end;
$function$


CREATE OR REPLACE FUNCTION public.get_people_choice_admin_status(p_event_id text DEFAULT 'common-ground-2026-10-11'::text)
 RETURNS TABLE(voting_open boolean, voting_paused boolean, ready_project_count integer, vote_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_paused boolean;
  v_organizer_override boolean := false;
begin
  if p_event_id is distinct from 'common-ground-2026-10-11' then
    raise exception 'This ballot is not available.' using errcode = '22023';
  end if;
  if (select auth.uid()) is null or not (select public.is_current_user_organizer()) then
    raise exception 'Only organisers can view voting controls.' using errcode = '42501';
  end if;
  select coalesce(s.voting_paused, false), coalesce(s.voting_open, false)
    into v_paused, v_organizer_override
  from public.people_choice_settings s where s.event_id = p_event_id;
  return query select
    v_now < timestamptz '2026-10-14 23:59:59+08'
      and not coalesce(v_paused, false)
      and (v_now >= timestamptz '2026-10-12 18:00:00+08'
        or coalesce(v_organizer_override, false)),
    coalesce(v_paused, false),
    (select count(*)::integer from public.submissions s where s.event_id = p_event_id and s.status = 'ready'),
    (select count(*)::bigint from public.people_choice_votes v where v.event_id = p_event_id);
end;
$function$


CREATE OR REPLACE FUNCTION public.set_people_choice_voting(p_open boolean, p_event_id text DEFAULT 'common-ground-2026-10-11'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if p_event_id is distinct from 'common-ground-2026-10-11' then
    raise exception 'This ballot is not available.' using errcode = '22023';
  end if;
  if (select auth.uid()) is null or not (select public.is_current_user_organizer()) then
    raise exception 'Only organisers can change voting controls.' using errcode = '42501';
  end if;
  if coalesce(p_open, false) and v_now >= timestamptz '2026-10-14 23:59:59+08' then
    raise exception 'Voting ended at 11:59 PM Wednesday, 14 October SGT.' using errcode = '55000';
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
$function$


insert into public.people_choice_settings(event_id, voting_open, voting_paused, updated_at)
values ('common-ground-2026-10-11', true, false, pg_catalog.clock_timestamp())
on conflict (event_id) do update set
  voting_open = true,
  voting_paused = false,
  updated_at = excluded.updated_at;