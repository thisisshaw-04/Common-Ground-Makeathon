-- Let verified project team emails access their already-published entry.
-- The participant list controls voting quotas, not project ownership.

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
    and status = 'ready'
    and (
      lower(coalesce(owner_email, '')) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
      or lower(coalesce(team #>> '{contact,email}', '')) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
      or case
        when jsonb_typeof(team -> 'members') = 'array' then exists (
          select 1
          from jsonb_array_elements(team -> 'members') as member(value)
          where lower(coalesce(member.value ->> 'email', '')) =
            lower(coalesce((select auth.jwt() ->> 'email'), ''))
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
    and status = 'ready'
    and (
      lower(coalesce(owner_email, '')) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
      or lower(coalesce(team #>> '{contact,email}', '')) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
      or case
        when jsonb_typeof(team -> 'members') = 'array' then exists (
          select 1
          from jsonb_array_elements(team -> 'members') as member(value)
          where lower(coalesce(member.value ->> 'email', '')) =
            lower(coalesce((select auth.jwt() ->> 'email'), ''))
        )
        else false
      end
    )
  )
)
with check (
  user_id = (select auth.uid())
  or (select public.is_current_user_organizer())
  or (
    event_id = 'common-ground-2026-10-11'
    and status = 'ready'
    and (
      lower(coalesce(owner_email, '')) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
      or lower(coalesce(team #>> '{contact,email}', '')) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
      or case
        when jsonb_typeof(team -> 'members') = 'array' then exists (
          select 1
          from jsonb_array_elements(team -> 'members') as member(value)
          where lower(coalesce(member.value ->> 'email', '')) =
            lower(coalesce((select auth.jwt() ->> 'email'), ''))
        )
        else false
      end
    )
  )
);