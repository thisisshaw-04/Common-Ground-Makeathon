# Common Ground — Portal

Static **Common Ground** makeathon portal. The builder and organiser pages are plain HTML/CSS/JS; central project submissions use Supabase.

| Page | Who it is for | What it does |
| --- | --- | --- |
| [`index.html`](index.html) | Builders | Signs approved attendees in by email link, lets them claim available tool offers once each, and save a team submission. |
| [`admin.html`](admin.html) | Organisers | Edits the front portal's copy, schedule, FAQ, tool credits and participant roster in this browser. |
| [`submissions.html`](submissions.html) | Organisers | Secure submissions inbox, finalist selection, People’s Choice controls, and closed-poll tally. |\n| [`vote.html`](vote.html) | Approved attendees | One verified-email ballot for People’s Choice. |

## Run it

No install, no bundler. From the repository folder, run:

```bash
python3 -m http.server 5180
```

Then open <http://localhost:5180/index.html>. Opening the files directly with `file://` mostly works too, but a
local server is closer to production and keeps the clipboard API happy.

### Builder access

Builders enter the email address used to register and receive a one-time sign-in link. After verification,
the database checks the private `eligible_participants` roster before showing claims or allowing central
submissions. Any email provider works; no Google account is required. The roster is not embedded in the
site source.

The event copy and schedule are local static content. The old `admin.html` editor is a browser-only
prototype; it does not publish changes or manage the real eligibility roster. Use Supabase for the roster,
code inventory, submissions, and voting permissions.

## Design notes

Type is **Google Sans** for everything except labels and codes, which use IBM Plex Mono. Ground is
warm off-white `#f3f2ed` and near-black `#11120f`, with fluorescent yellow `#e8f447` as the signal color.
The portal pairs quiet editorial spacing and restrained type with pixel-grid tracking marks drawn in CSS.

Google Sans serves weights 400 / 500 / 700 (plus italic) from Google Fonts — there is no 600, so the
CSS uses 700 wherever a heavy weight is wanted. Fonts load via `<link>` with `preconnect` in each page
head rather than a CSS `@import`, so they do not block the first render.
Dark panels mark the parts that belong to *you* (your token, your codes); everything on cream is public
event information.


### Layout references

The layout uses Mobbin references for hierarchy and spacing while retaining the Common Ground palette:

- [Bonsai project overview](https://mobbin.com/screens/5ac492a4-c466-4a97-9adc-0c7341c4e123): grouped navigation and distinct content surfaces.
- [Squarespace project workspace](https://mobbin.com/screens/7e8ff03d-16ac-4efc-a8d9-06e2005d9f63): generous spacing, restrained borders, and a readable sidebar.

The builder page includes section links, a primary token shortcut, an event summary card,
and responsive information and credit cards. The organiser console groups its controls in a
sidebar on desktop and wrapping navigation on mobile. Keyboard users have skip links,
visible focus outlines, and a visible email label. Reduced-motion preferences disable smooth scrolling.


Event: Sunday, 11 October 2026, 9am–5pm at SQ Collective. The one-day programme runs from check-in and kick-off through build sessions, lunch, demos, and a 5pm close.

## Tool code claims

Builders verify their email first, then claim OpenAI, Figma, and Mobbin separately. Supabase reserves one
inventory item per eligible account and tool, so repeat clicks retrieve the same item and competing claims
cannot over-allocate a pool. The codes and promo URLs stay in the private database inventory, not in this
repository. Each offer has a 100-claim cap; the claim pools start empty only if the inventory has not been
loaded.

## Central project submissions

Builders sign in with a one-time email link and save drafts to Supabase. Submit one entry per team; teams
should nominate one member to submit. Supabase enforces one submission per normalized team name for the
event. The project form captures up to two of four award tracks, project overview (100 words total), the
build (100 words total), accessible demo/source links, track-specific reflections, collaboration, and
AI/tool attribution. A ready submission must include the required fields, a demo or demo video, source
code unless marked non-code, and a reflection for each nominated judged track. The organiser inbox is
`submissions.html`; only organiser emails can read all rows. Builders can read and update their own row,
and database policies require their signed-in email to be on the eligible-participant list.

## People's Choice

An organiser selects 2–8 ready projects in `submissions.html`, then opens voting when the finalists are
announced. Only authenticated eligible attendees can see the finalists and cast a ballot. Supabase
enforces one vote per account and prevents changes after submission. The finalist list locks after the
first ballot; organisers close voting before the tally becomes visible. Voting starts closed and must be
opened by an organiser.

## Supabase setup

1. The live project already contains the eligible-participant roster, organisers, and private tool-code
   inventory. Do not re-import those lists or put them in GitHub.
2. For a fresh setup, run `supabase/schema.sql` in the Supabase SQL Editor. The additive migration files
   under `supabase/migrations/` describe the live People’s Choice database changes.
3. In Supabase Authentication → URL Configuration, set the Site URL to the deployed GitHub Pages URL and
   allow redirects to:
   `https://thisisshaw-04.github.io/Common-Ground-Makeathon/index.html`,
   `https://thisisshaw-04.github.io/Common-Ground-Makeathon/submissions.html`, and
   `https://thisisshaw-04.github.io/Common-Ground-Makeathon/vote.html`. Add
   `http://localhost:5180/**` for local development.
4. Add organiser emails in the SQL Editor, replacing the example with each organiser's lower-case email:
   ```sql
   insert into public.organizers (email) values ('organizer@example.com')
   on conflict (email) do nothing;
   ```
5. The browser client uses the project URL and publishable key in `assets/backend-config.js`. The
   publishable key is expected to be public; never put a Supabase secret or service-role key in the site.
6. Configure Supabase Auth SMTP before sending links to the event roster. Brevo Free can send up to
   300 emails per day and includes Brevo branding; verify a sending domain, then add its SMTP credentials
   in Supabase Auth settings. See the [Brevo setup instructions](https://help.brevo.com/hc/en-us/articles/7924908994450-Send-transactional-emails-using-Brevo-SMTP).
7. Raise Supabase's custom-SMTP send limit to cover the expected sign-in burst while staying within
   Brevo's daily cap. Configure the production Site URL and allowed redirect list before asking attendees
   to sign in.

The browser uses Supabase RLS and the publishable key; no privileged key is shipped to GitHub Pages.
