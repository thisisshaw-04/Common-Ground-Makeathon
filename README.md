# Common Ground — Makeathon Portal

Static GitHub Pages site for the 11 October 2026 Common Ground makeathon. The builder portal, first-come partner offers, event schedule, submissions, public gallery, and People’s Choice ballot use Supabase for sign-in and protected data.

| Page | Who it is for | What it does |
| --- | --- | --- |
| [`index.html`](index.html) | Builders and attendees | Three selectable parts: partner offers and sign-in; live event schedule; project submission, public gallery, and People’s Choice voting. |
| [`submissions.html`](submissions.html) | Organisers and judges | Private submissions, 1–5 rubric scoring, a separate top-four-per-judged-track shortlist, and voting controls/results. |

## Event flow

- Partner offers are first come, first served. Supabase checks eligible emails and assigns each limited code atomically. OpenAI, Figma, and Mobbin offers each have a limit of 100.
- The event timeline uses Singapore time. Project submissions close at 3:15 PM on 11 October 2026. The gallery opens at the same time.
- The gallery is public after submissions close. It shows project information and links but not participant email addresses.
- Eligible, signed-in attendees can vote for up to three different projects from 3:15 PM until 5:00 PM. They cannot vote for their own team. Supabase enforces eligibility, the three-vote limit, duplicate prevention, and the self-vote rule.
- One ready submission is allowed per team, with up to two selected tracks.

## Supabase

The static site uses the public anon key from `assets/backend-config.js`. Row Level Security protects attendee eligibility, submissions, organizer access, and ballots. Do not put participant email lists, service-role keys, or partner code inventories in this repository.

Apply migrations in `supabase/migrations` in order. The live schedule and gallery/voting migration adds server-side event cutoffs, public gallery access after the deadline, and the three-project ballot. Review the Supabase dashboard before changing production settings.

## Local preview

Serve the repository root over HTTP, for example with Python's static server, and open `index.html`. GitHub Pages serves the production site.

## Security notes

- Submissions remain private until their team marks them ready; the public gallery RPC returns only safe, reviewed project fields after the cutoff.
- Vote records are private. Clients can cast votes only through the Supabase RPC; organizers can view results after voting is closed.
- Keep `eligible_participants`, `organizers`, and all promo code inventory data in Supabase.
