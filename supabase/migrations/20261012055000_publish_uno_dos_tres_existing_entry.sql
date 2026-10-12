do $publish_uno_dos_tres$
declare
  v_original text;
  v_temporary text;
  v_match_count integer;
  v_row_count integer;
  v_submission_id uuid;
  v_status text;
begin
  select pg_catalog.pg_get_functiondef('public.common_ground_submission_guard()'::pg_catalog.regprocedure)
    into v_original;
  select count(*)::integer into v_match_count
  from pg_catalog.regexp_matches(
    v_original,
    $pattern$v_closed := not coalesce\(v_manual_open, false\)[[:space:]]+or v_now < v_edit_start[[:space:]]+or v_now >= v_edit_end;$pattern$,
    'g'
  );
  if v_match_count <> 2 then
    raise exception 'Expected both scheduled submission-window checks; found %.', v_match_count;
  end if;
  v_temporary := pg_catalog.regexp_replace(
    v_original,
    $pattern$v_closed := not coalesce\(v_manual_open, false\)[[:space:]]+or v_now < v_edit_start[[:space:]]+or v_now >= v_edit_end;$pattern$,
    'v_closed := false;',
    'g'
  );
  execute v_temporary;

  select count(*)::integer into v_row_count
  from public.submissions s
  where s.event_id = 'common-ground-2026-10-11'
    and s.project ->> 'name' = 'Uno Dos Tres';
  if v_row_count > 1 then
    raise exception 'More than one Uno Dos Tres project was found.';
  elsif v_row_count = 1 then
    select s.id, s.status into v_submission_id, v_status
    from public.submissions s
    where s.event_id = 'common-ground-2026-10-11'
      and s.project ->> 'name' = 'Uno Dos Tres';
    if v_status = 'draft' then
      update public.submissions s
      set status = 'ready'
      where s.id = v_submission_id
        and exists (
          select 1 from private.allowed_final_submissions a
          where a.event_id = s.event_id and a.submission_id = s.id
        );
      if not found then
        raise exception 'Uno Dos Tres is not in the allowed final-submission list.';
      end if;
    elsif v_status <> 'ready' then
      raise exception 'Uno Dos Tres has unexpected status: %.', v_status;
    end if;
  end if;

  execute v_original;
end;
$publish_uno_dos_tres$;
