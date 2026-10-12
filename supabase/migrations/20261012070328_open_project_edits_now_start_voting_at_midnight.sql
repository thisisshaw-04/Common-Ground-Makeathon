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
  if v_now < timestamptz '2026-10-13 00:00:00+08'
     or v_now >= timestamptz '2026-10-14 23:59:59+08' then
    raise exception 'People’s Choice voting is open from 12:00 AM Tuesday, 13 October to 11:59 PM Wednesday, 14 October SGT.'
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

CREATE OR REPLACE FUNCTION public.common_ground_preview_image_deadline_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_cutoff constant timestamptz := timestamptz '2026-10-13 00:00:00+08';
  v_old_image text;
  v_new_image text;
begin
  if new.event_id is distinct from 'common-ground-2026-10-11' then
    return new;
  end if;

  v_new_image := coalesce(
    nullif(pg_catalog.btrim(new.project ->> 'previewImage'), ''),
    nullif(pg_catalog.btrim(new.project ->> 'preview_image_url'), ''),
    nullif(pg_catalog.btrim(new.project ->> 'preview_image'), '')
  );

  if tg_op = 'UPDATE' then
    v_old_image := coalesce(
      nullif(pg_catalog.btrim(old.project ->> 'previewImage'), ''),
      nullif(pg_catalog.btrim(old.project ->> 'preview_image_url'), ''),
      nullif(pg_catalog.btrim(old.project ->> 'preview_image'), '')
    );
    if v_now < v_cutoff or v_new_image is not distinct from v_old_image then
      return new;
    end if;
  elsif tg_op = 'INSERT' then
    if v_now < v_cutoff or v_new_image is null then
      return new;
    end if;
  else
    return new;
  end if;

  raise exception 'Project preview images can be changed until 12:00 AM SGT Tuesday, 13 October.'
    using errcode = '55000';
end;
$function$;

CREATE OR REPLACE FUNCTION public.common_ground_submission_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_overview text;
  v_build text;
  v_manual_open boolean;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_closed boolean;
  v_is_organizer boolean := public.is_current_user_organizer();
  v_edit_start constant timestamptz := timestamptz '2026-10-12 00:00:00+08';
  v_edit_end constant timestamptz := timestamptz '2026-10-13 00:00:00+08';
begin
  if tg_op = 'INSERT' then
    if new.event_id = 'common-ground-2026-10-11' then
      select s.submissions_open into v_manual_open
      from public.people_choice_settings s
      where s.event_id = 'common-ground-2026-10-11';
      v_closed := not coalesce(v_manual_open, false)
        or v_now < v_edit_start
        or v_now >= v_edit_end;
      if v_closed then
        raise exception 'Project updates are open from 12:00 AM Monday, 12 October to 12:00 AM Tuesday, 13 October SGT.'
          using errcode = '55000';
      end if;
      if not v_is_organizer then
        raise exception 'New project entries are closed. You can only update an existing project.'
          using errcode = '55000';
      end if;
    end if;
  elsif tg_op = 'UPDATE' then
    if old.event_id = 'common-ground-2026-10-11' or new.event_id = 'common-ground-2026-10-11' then
      select s.submissions_open into v_manual_open
      from public.people_choice_settings s
      where s.event_id = 'common-ground-2026-10-11';
      v_closed := not coalesce(v_manual_open, false)
        or v_now < v_edit_start
        or v_now >= v_edit_end;
      if v_closed then
        raise exception 'Project image and demo link updates are open from 12:00 AM Monday, 12 October to 12:00 AM Tuesday, 13 October SGT.'
          using errcode = '55000';
      end if;

      if not v_is_organizer then
        if old.event_id is distinct from 'common-ground-2026-10-11'
           or new.event_id is distinct from 'common-ground-2026-10-11' then
          raise exception 'An existing project cannot be moved into or out of this event.'
            using errcode = '55000';
        end if;

        if old.status not in ('draft', 'ready') or new.status not in ('draft', 'ready') then
          raise exception 'Existing projects can only remain drafts or submitted entries.'
            using errcode = '55000';
        end if;

        if old.status = 'draft'
           and not exists (
             select 1
             from private.allowed_final_submissions allowed
             where allowed.event_id = 'common-ground-2026-10-11'
               and allowed.submission_id = old.id
           ) then
          raise exception 'Only submitted projects already visible in the gallery and the existing Uno Dos Tres draft can be edited.'
            using errcode = '55000';
        end if;

        if old.status = 'ready' and new.status <> 'ready' then
          raise exception 'A submitted project cannot be changed back to a draft.'
            using errcode = '55000';
        end if;

        if old.status = 'draft' and new.status = 'ready'
           and not exists (
             select 1
             from private.allowed_final_submissions allowed
             where allowed.event_id = 'common-ground-2026-10-11'
               and allowed.submission_id = old.id
           ) then
          raise exception 'Only the existing Uno Dos Tres entry may be submitted. Other saved projects can still be edited.'
            using errcode = '55000';
        end if;

        if old.team is distinct from new.team then
          raise exception 'Team details are locked. Only the project preview image and demo links can be updated.'
            using errcode = '55000';
        end if;

        if (pg_catalog.to_jsonb(new) - 'project' - 'status' - 'updated_at')
           is distinct from
           (pg_catalog.to_jsonb(old) - 'project' - 'status' - 'updated_at') then
          raise exception 'Project details are locked. Only the project preview image and demo links can be updated.'
            using errcode = '55000';
        end if;

        if (coalesce(new.project, '{}'::jsonb) - 'previewImage' - 'preview_image_url' - 'preview_image' - 'demo' - 'video')
           is distinct from
           (coalesce(old.project, '{}'::jsonb) - 'previewImage' - 'preview_image_url' - 'preview_image' - 'demo' - 'video') then
          raise exception 'Project details are locked. Only the project preview image, live demo, and demo video links can be updated.'
            using errcode = '55000';
        end if;
      end if;
    end if;
  elsif tg_op = 'DELETE' then
    if old.event_id = 'common-ground-2026-10-11' then
      raise exception 'Submitted project records cannot be deleted by attendees.'
        using errcode = '55000';
    end if;
    return old;
  end if;

  new.updated_at := pg_catalog.clock_timestamp();
  if new.event_id = 'common-ground-2026-10-11' and new.status = 'ready' then
    v_overview := coalesce(
      nullif(pg_catalog.btrim(new.project ->> 'overview'), ''),
      pg_catalog.concat_ws(' ',
        new.project ->> 'oneLiner',
        new.project ->> 'inspiration',
        new.project ->> 'solution',
        new.project ->> 'interesting'
      )
    );
    v_build := coalesce(
      nullif(pg_catalog.btrim(new.project ->> 'build'), ''),
      pg_catalog.concat_ws(' ',
        new.project ->> 'technology',
        new.project ->> 'made',
        new.project ->> 'experiment',
        new.project ->> 'next'
      )
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
$function$;

CREATE OR REPLACE FUNCTION public.get_common_ground_event_state()
 RETURNS TABLE(current_at timestamp with time zone, submissions_closed boolean, gallery_open boolean, voting_open boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_manual_open boolean;
  v_paused boolean;
begin
  select s.submissions_open, coalesce(s.voting_paused, false)
    into v_manual_open, v_paused
  from public.people_choice_settings s
  where s.event_id = 'common-ground-2026-10-11';

  return query select
    v_now,
    not (
      coalesce(v_manual_open, false)
      and v_now >= timestamptz '2026-10-12 00:00:00+08'
      and v_now < timestamptz '2026-10-13 00:00:00+08'
    ),
    v_now >= timestamptz '2026-10-11 15:15:00+08',
    v_now >= timestamptz '2026-10-13 00:00:00+08'
      and v_now < timestamptz '2026-10-14 23:59:59+08'
      and not coalesce(v_paused, false);
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_people_choice_admin_status(p_event_id text DEFAULT 'common-ground-2026-10-11'::text)
 RETURNS TABLE(voting_open boolean, voting_paused boolean, ready_project_count integer, vote_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    v_now >= timestamptz '2026-10-13 00:00:00+08'
      and v_now < timestamptz '2026-10-14 23:59:59+08'
      and not coalesce(v_paused, false),
    coalesce(v_paused, false),
    (select count(*)::integer from public.submissions s where s.event_id = p_event_id and s.status = 'ready'),
    (select count(*)::bigint from public.people_choice_votes v where v.event_id = p_event_id);
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
    v_now >= timestamptz '2026-10-13 00:00:00+08'
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
  if v_now < timestamptz '2026-10-13 00:00:00+08'
     or v_now >= timestamptz '2026-10-14 23:59:59+08' then
    raise exception 'People’s Choice voting is open from 12:00 AM Tuesday, 13 October to 11:59 PM Wednesday, 14 October SGT.' using errcode = '55000';
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
  if coalesce(p_open, false) and
     (v_now < timestamptz '2026-10-13 00:00:00+08' or v_now >= timestamptz '2026-10-14 23:59:59+08') then
    raise exception 'Voting runs from 12:00 AM Tuesday, 13 October to 11:59 PM Wednesday, 14 October SGT.' using errcode = '55000';
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
$function$;
