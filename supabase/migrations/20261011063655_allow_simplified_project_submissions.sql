alter table public.submissions
  drop constraint if exists ready_submission_complete;

alter table public.submissions
  add constraint ready_submission_complete
  check (
    status <> 'ready'
    or (
      nullif(trim(project ->> 'name'), '') is not null
      and case
        when jsonb_typeof(project -> 'tracks') = 'array'
          then jsonb_array_length(project -> 'tracks') between 1 and 2
        else false
      end
      and (project -> 'tracks') <@ '["Design × Tech", "Culture × Tech", "Best Use of Tech", "Common Ground Award"]'::jsonb
      and (
        nullif(trim(project ->> 'overview'), '') is not null
        or (
          nullif(trim(project ->> 'oneLiner'), '') is not null
          and nullif(trim(project ->> 'inspiration'), '') is not null
          and nullif(trim(project ->> 'solution'), '') is not null
          and nullif(trim(project ->> 'interesting'), '') is not null
        )
      )
      and (
        nullif(trim(project ->> 'build'), '') is not null
        or (
          nullif(trim(project ->> 'technology'), '') is not null
          and nullif(trim(project ->> 'made'), '') is not null
          and nullif(trim(project ->> 'experiment'), '') is not null
          and nullif(trim(project ->> 'next'), '') is not null
        )
      )
      and nullif(trim(project ->> 'collaboration'), '') is not null
      and nullif(trim(project ->> 'attribution'), '') is not null
      and nullif(trim(team ->> 'name'), '') is not null
    )
  );
