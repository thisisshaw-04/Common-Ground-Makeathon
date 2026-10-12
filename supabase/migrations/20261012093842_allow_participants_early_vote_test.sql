do $migration$
declare
  status_definition text;
  cast_definition text;
begin
  select pg_catalog.pg_get_functiondef('public.get_people_choice_status(text)'::pg_catalog.regprocedure)
    into status_definition;

  if status_definition not like '%v_is_organizer and coalesce(v_organizer_override, false)%' then
    raise exception 'Expected organiser voting override was not found in get_people_choice_status.';
  end if;

  status_definition := pg_catalog.replace(
    status_definition,
    'v_is_organizer and coalesce(v_organizer_override, false)',
    '(v_is_organizer or public.is_current_user_eligible()) and coalesce(v_organizer_override, false)'
  );
  execute status_definition;

  select pg_catalog.pg_get_functiondef('public.cast_people_choice_vote(uuid, text)'::pg_catalog.regprocedure)
    into cast_definition;

  if cast_definition not like '%v_is_organizer and exists (%' then
    raise exception 'Expected organiser early-voting check was not found in cast_people_choice_vote.';
  end if;

  cast_definition := pg_catalog.replace(
    cast_definition,
    'v_is_organizer and exists (',
    'v_is_builder and exists ('
  );
  cast_definition := pg_catalog.replace(
    cast_definition,
    'only organisers can vote before then.',
    'only organisers and participant-list emails can vote before then.'
  );
  execute cast_definition;
end
$migration$;
