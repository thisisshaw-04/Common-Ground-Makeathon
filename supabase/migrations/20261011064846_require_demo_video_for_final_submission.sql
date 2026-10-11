ALTER TABLE public.submissions
  DROP CONSTRAINT IF EXISTS ready_submission_complete;

ALTER TABLE public.submissions
  ADD CONSTRAINT ready_submission_complete
  CHECK (
    status <> 'ready'
    OR (
      NULLIF(BTRIM(project ->> 'name'), '') IS NOT NULL
      AND CASE
        WHEN jsonb_typeof(project -> 'tracks') = 'array'
          THEN jsonb_array_length(project -> 'tracks') BETWEEN 1 AND 2
        ELSE false
      END
      AND (project -> 'tracks') <@ '["Design × Tech", "Culture × Tech", "Best Use of Tech", "Common Ground Award"]'::jsonb
      AND (
        NULLIF(BTRIM(project ->> 'overview'), '') IS NOT NULL
        OR (
          NULLIF(BTRIM(project ->> 'oneLiner'), '') IS NOT NULL
          AND NULLIF(BTRIM(project ->> 'inspiration'), '') IS NOT NULL
          AND NULLIF(BTRIM(project ->> 'solution'), '') IS NOT NULL
          AND NULLIF(BTRIM(project ->> 'interesting'), '') IS NOT NULL
        )
      )
      AND (
        NULLIF(BTRIM(project ->> 'build'), '') IS NOT NULL
        OR (
          NULLIF(BTRIM(project ->> 'technology'), '') IS NOT NULL
          AND NULLIF(BTRIM(project ->> 'made'), '') IS NOT NULL
          AND NULLIF(BTRIM(project ->> 'experiment'), '') IS NOT NULL
          AND NULLIF(BTRIM(project ->> 'next'), '') IS NOT NULL
        )
      )
      AND NULLIF(BTRIM(project ->> 'video'), '') IS NOT NULL
      AND BTRIM(project ->> 'video') ~* '^https?://'
      AND NULLIF(BTRIM(project ->> 'collaboration'), '') IS NOT NULL
      AND NULLIF(BTRIM(project ->> 'attribution'), '') IS NOT NULL
      AND NULLIF(BTRIM(team ->> 'name'), '') IS NOT NULL
    )
  );
