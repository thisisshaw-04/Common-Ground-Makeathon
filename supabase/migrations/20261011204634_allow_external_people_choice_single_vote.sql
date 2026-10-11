-- Permit verified non-builder accounts to cast one People’s Choice vote.
-- Approved builders retain their existing three-vote allowance.
-- Submission and partner-offer eligibility remains controlled separately.

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
  v_is_builder := (select public.is_current_user_eligible());
  v_vote_limit := case when v_is_builder then 3 else 1 end;
  if v_now < timestamptz '2026-10-12 12:00:00+08'
     or v_now >= timestamptz '2026-10-14 23:59:59+08' then
    raise exception 'People’s Choice voting is open from 12:00 PM Monday, 12 October to 11:59 PM Wednesday, 14 October SGT.'
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
$function$;

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
  select coalesce(s.voting_paused, false) into v_paused
  from public.people_choice_settings s where s.event_id = p_event_id;

  return query
  select
    v_now >= timestamptz '2026-10-12 12:00:00+08'
      and v_now < timestamptz '2026-10-14 23:59:59+08'
      and not coalesce(v_paused, false),
    count(v.submission_id)::integer,
    coalesce(pg_catalog.array_agg(v.submission_id) filter (where v.submission_id is not null), array[]::uuid[])
  from public.people_choice_votes v
  where v.event_id = p_event_id and v.voter_id = v_voter;
end;
$function$;

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
  if v_now < timestamptz '2026-10-12 12:00:00+08'
     or v_now >= timestamptz '2026-10-14 23:59:59+08' then
    raise exception 'People’s Choice voting is open from 12:00 PM Monday, 12 October to 11:59 PM Wednesday, 14 October SGT.' using errcode = '55000';
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
$function$;
