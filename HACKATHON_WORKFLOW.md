# Common Ground Makeathon — live workflow

The public site is the GitHub Pages builder portal. Builders use the email on their approved attendee registration to receive a Supabase magic link. Google sign-in is not required.

## Required deployment order

1. In the Supabase SQL Editor for project `bzbvznnqiqbxkcaghnfo`, run the complete contents of `supabase/migrations/20261011_complete_hackathon_workflow.sql`. This migration adds ready-submission checks, organiser-only judging scores, and an approved-attendee gallery RPC. It does not change the 120-person eligibility roster or promo-code inventory.
2. Merge the workflow pull request so GitHub Pages can publish the updated portal.
3. In Supabase **Authentication → URL Configuration**, keep the site URL and the `index.html` and `submissions.html` redirect URLs that are already configured.
4. Give builders the site link: https://thisisshaw-04.github.io/Common-Ground-Makeathon/

## Builder flow

- Sign in with the attendee email in Supabase's `eligible_participants` list.
- One teammate should own the team's submission account. The form supports drafts and central save; ready entries require the complete project template. Choose one teammate as the submitter so the team keeps one central entry under that attendee account.
- Project Overview and The Build each have a combined 100-word limit. Choose up to two tracks. Design × Tech and Culture × Tech nominations reveal the matching reflection prompt.
- Ready projects appear in the gallery to signed-in approved attendees. Drafts, judge notes, and attendee email addresses are never returned by the gallery RPC.
- OpenAI, Figma and Mobbin links are claimed through the existing first-come-first-served Supabase inventory. A signed-in attendee can retrieve the same claim again; each pool stops when empty.

## Organizer flow

- Open `submissions.html` and sign in with an email in `public.organizers`.
- Score ready projects from 1–5 for Concept, Track Fit, Execution, and Presentation. The page shows the equal-weight average and total out of 20.
- Use **Select top 4 per primary track** to form the Design × Tech and Culture × Tech shortlist. If a project is nominated in both, it appears once. Review the shortlist, then save it.
- Open People’s Choice when voting is ready. Eligible attendees can cast one vote. Close voting to reveal the tally. The existing Supabase voting RPC locks finalists after the first vote is cast and prevents reopening a completed ballot.
- Best Use of Tech and Common Ground remain cross-track awards and need a separate organizer decision; People’s Choice is a separate audience vote.

## Supabase access controls

The attendee roster and promo-code inventory stay in Supabase. The project gallery RPC returns only ready project names, team names, nominations, descriptions and links to authenticated eligible attendees. Score rows are readable by organizers, and each organizer can write only their own rubric. Existing submission RLS continues to restrict drafts and attendee records.
