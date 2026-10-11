-- Reopen People’s Choice voting for a scheduled two-day window.
-- All timestamps below are Singapore time (UTC+08:00).
do $$
declare
  v_signature text;
  v_function regprocedure;
  v_definition text;
  v_old_open constant text := '2026-10-11 15:15:00+08';
  v_new_open constant text := '2026-10-13 12:00:00+08';
  v_old_close constant text := '2026-10-11 17:00:00+08';
  v_new_close constant text := '2026-10-14 23:59:59+08';
begin
  foreach v_signature in array array[
    'public.get_common_ground_event_state()',
    'public.get_people_choice_status(text)',
    'public.cast_people_choice_vote(uuid,text)',
    'public.get_people_choice_admin_status(text)',
    'public.set_people_choice_voting(boolean,text)'
  ]
  loop
    v_function := pg_catalog.to_regprocedure(v_signature);
    if v_function is null then
      raise exception 'Expected voting function is missing: %', v_signature;
    end if;
    select pg_catalog.pg_get_functiondef(v_function) into v_definition;
    if pg_catalog.strpos(v_definition, v_old_open) = 0
       and pg_catalog.strpos(v_definition, v_new_open) = 0 then
      raise exception 'Unexpected voting start time in %', v_signature;
    end if;
    if pg_catalog.strpos(v_definition, v_old_close) = 0
       and pg_catalog.strpos(v_definition, v_new_close) = 0 then
      raise exception 'Unexpected voting end time in %', v_signature;
    end if;
    v_definition := pg_catalog.replace(v_definition, v_old_open, v_new_open);
    v_definition := pg_catalog.replace(v_definition, v_old_close, v_new_close);
    v_definition := pg_catalog.replace(
      v_definition,
      'People’s Choice voting is open from 3:15 PM to 5:00 PM SGT.',
      'People’s Choice voting is open from 12:00 PM Tuesday, 13 October to 11:59 PM Wednesday, 14 October SGT.'
    );
    v_definition := pg_catalog.replace(
      v_definition,
      'Voting runs from 3:15 PM to 5:00 PM SGT.',
      'Voting runs from 12:00 PM Tuesday, 13 October to 11:59 PM Wednesday, 14 October SGT.'
    );
    execute v_definition;
  end loop;
end $$;

-- The gallery UI already supports unvoting; install its missing authenticated RPC.
create or replace function public.remove_people_choice_vote(
  p_submission_id uuid,
  p_event_id text default 'common-ground-2026-10-11'
)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_voter uuid := (select auth.uid());
  v_paused boolean;
begin
  if p_event_id is distinct from 'common-ground-2026-10-11' then
    raise exception 'This ballot is not available.' using errcode = '22023';
  end if;
  if v_voter is null then
    raise exception 'Sign in is required to remove a vote.' using errcode = '28000';
  end if;
  if not (select public.is_current_user_eligible()) then
    raise exception 'Only approved attendees can change votes.' using errcode = '42501';
  end if;
  if v_now < timestamptz '2026-10-13 12:00:00+08'
     or v_now >= timestamptz '2026-10-14 23:59:59+08' then
    raise exception 'People’s Choice voting is open from 12:00 PM Tuesday, 13 October to 11:59 PM Wednesday, 14 October SGT.' using errcode = '55000';
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

revoke execute on function public.remove_people_choice_vote(uuid, text) from public, anon;
grant execute on function public.remove_people_choice_vote(uuid, text) to authenticated;
