# Common Ground — Makeathon Portal

Static GitHub Pages site for the 11 October 2026 Common Ground makeathon. The builder portal, secure submissions, organiser inbox, judging controls, project gallery, and People’s Choice ballot are plain HTML, CSS, and JavaScript backed by Supabase.

| Page | Who it is for | What it does |
| --- | --- | --- |
| [`index.html`](index.html) | Builders | Email sign-in, limited first-come partner code claims, team/project submission, and an attendee-only gallery of ready projects. |
| [`submissions.html`](submissions.html) | Organisers and judges | Private submission inbox, 1–5 rubric scoring, score-based shortlist helper, finalist selection, and People’s Choice controls. |
| [`vote.html`](vote.html) | Eligible attendees | One verified-email People’s Choice ballot. |
| [`admin.html`](admin.html) | Existing bookmarks | Redirects to the secure organiser inbox. |

## Builder flow

Attendees enter the email address used to register and receive a one-time Supabase sign-in link. Any email provider works. Supabase checks the signed-in email against the private `eligible_participants` roster before showing partner claims, submission forms, or the project gallery. Participant emails are not stored in this repository.

The tools are limited pools in Supabase. An eligible attendee may claim each available offer once; repeat clicks retrieve the same reserved code. The database, not browser code, enforces eligibility and prevents over-allocation.

Each team should submit once. The form supports up to two award tracks, a 100-word overview, a 100-word build summary, required demo/source links, track reflections, team collaboration, and AI/tool attribution. Teams can save drafts before marking an entry ready.

## Judging and voting

Organisers sign in through `submissions.html`. Each judge scores ready projects from 1–5 in Concept, Track Fit, Execution, and Presentation; all four criteria count equally for a 20-point total. Organisers can see each judge’s scores and private notes. The shortlist helper selects up to four highest-scoring ready projects from each judged track, removes duplicates, and checks the matching finalist boxes. Organisers review and save the finalist list themselves.

The project gallery shows ready entries only, and only to authenticated eligible attendees. It does not expose attendee emails or team member contact details. People’s Choice finalists are a separate view on `vote.html`; Supabase allows one ballot per eligible account and keeps the ballot final. Voting starts closed. An organiser opens and closes it in the inbox.

## Supabase setup

The live project already contains the attendee roster, organiser list, private tool-code inventory, central submissions, and People’s Choice tables. Do not re-import those lists or add attendee emails to GitHub.

For a fresh project, run `supabase/schema.sql`. To enable the gallery and judging features on the existing live project, run the additive migration `supabase/migrations/20261011000300_gallery_judging.sql` in the Supabase SQL Editor before publishing this change. It creates private organiser score storage and an eligible-attendee-only gallery RPC; it does not change existing attendee, submission, or voting records.

The production auth redirect should be set to the GitHub Pages site root:
`https://thisisshaw-04.github.io/Common-Ground-Makeathon/`.
The browser sign-in link always returns to that root, including when requested from the ballot page. Local development can allow `http://localhost:5180/**`.

The browser client uses the public Supabase publishable key in `assets/backend-config.js`. Never put a Supabase secret or service-role key in the static site. Configure Supabase Auth SMTP with the verified Brevo sender before sending links to attendees.

## Run locally

No install or bundler is required:

```bash
python3 -m http.server 5180
```

Open <http://localhost:5180/index.html>. A local server is preferred over `file://` because auth redirects need a stable origin.
