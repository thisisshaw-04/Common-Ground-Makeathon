create index if not exists people_choice_votes_submission_id_idx on public.people_choice_votes (submission_id);
create index if not exists people_choice_votes_voter_id_idx on public.people_choice_votes (voter_id);
create index if not exists people_choice_voter_locks_voter_id_idx on public.people_choice_voter_locks (voter_id);
