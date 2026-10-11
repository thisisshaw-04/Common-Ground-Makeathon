drop policy if exists submissions_read_own_or_organizer on public.submissions;
create policy submissions_read_own_or_organizer
on public.submissions
for select
to authenticated
using (
  user_id = (select auth.uid())
  or (select public.is_current_user_organizer())
  or (
    event_id = 'common-ground-2026-10-11'
    and (select public.is_current_user_eligible())
    and (
      lower(coalesce(team #>> '{contact,email}', '')) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
      or case
        when jsonb_typeof(team -> 'members') = 'array' then exists (
          select 1
          from jsonb_array_elements(team -> 'members') as member
          where lower(coalesce(member ->> 'email', '')) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
        )
        else false
      end
    )
  )
);

drop policy if exists submissions_update_own_or_organizer on public.submissions;
create policy submissions_update_own_or_organizer
on public.submissions
for update
to authenticated
using (
  user_id = (select auth.uid())
  or (select public.is_current_user_organizer())
  or (
    event_id = 'common-ground-2026-10-11'
    and (select public.is_current_user_eligible())
    and (
      lower(coalesce(team #>> '{contact,email}', '')) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
      or case
        when jsonb_typeof(team -> 'members') = 'array' then exists (
          select 1
          from jsonb_array_elements(team -> 'members') as member
          where lower(coalesce(member ->> 'email', '')) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
        )
        else false
      end
    )
  )
)
with check (
  (
    user_id = (select auth.uid())
    and event_id = 'common-ground-2026-10-11'
    and owner_email = lower(coalesce((select auth.jwt() ->> 'email'), ''))
    and (select public.is_current_user_eligible())
  )
  or (select public.is_current_user_organizer())
  or (
    event_id = 'common-ground-2026-10-11'
    and (select public.is_current_user_eligible())
    and (
      lower(coalesce(team #>> '{contact,email}', '')) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
      or case
        when jsonb_typeof(team -> 'members') = 'array' then exists (
          select 1
          from jsonb_array_elements(team -> 'members') as member
          where lower(coalesce(member ->> 'email', '')) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
        )
        else false
      end
    )
  )
);