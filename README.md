# Common Ground — Portal

Static **Common Ground** makeathon portal. The builder and organiser pages are plain HTML/CSS/JS; central project submissions use Supabase.

| Page | Who it is for | What it does |
| --- | --- | --- |
| [`index.html`](index.html) | Builders | Explains the event, takes the email someone signed up with, and shows their Common Ground token and tool credits. OpenAI, Figma and Mobbin offers are claimed once per approved builder, first come, first served. |
| [`admin.html`](admin.html) | Organisers | Edits the front portal's copy, schedule, FAQ, tool credits and participant roster in this browser. |
| [`submissions.html`](submissions.html) | Organisers | Secure inbox for centrally saved project submissions (requires Supabase setup). |

## Run it

No install, no bundler. From the repository folder, run:

```bash
python3 -m http.server 5180
```

Then open <http://localhost:5180/index.html>. Opening the files directly with `file://` mostly works too, but a
local server is closer to production and keeps the clipboard API happy.

### Try the builder flow

The seeded roster covers each state worth designing for:

| Email | State you get |
| --- | --- |
| `ada@example.com` | Confirmed, one credit already redeemed |
| `jun@example.com` | Confirmed, nothing redeemed yet |
| `mentor@example.com` | Mentor ticket, everything redeemed |
| `waitlist@example.com` | Waitlist — no token, no codes |
| anything else | Not-found error state |

You can also deep-link straight to a token: `index.html?email=ada@example.com`.

## How the two portals connect

Both pages read and write one record through [`assets/data.js`](assets/data.js), kept in `localStorage`
under the key `cg-portal-v1`. Edit something in the organiser console, press **Save changes**, and the
builder portal shows it — reload it, or watch it update live if you have both open in separate tabs.

```
assets/data.js      one record: { event, perks, participants }  ← swap this for API calls
assets/portal.css   shared styling for both pages
assets/portal.js    builder portal: renders content, looks up a token by email
assets/admin.js     organiser console: edits the record
```

### The data shape

```jsonc
{
  "event": {
    "name": "Common Ground", "edition": "...", "tagline": "...",
    "dates": "...", "venue": "...", "hours": "...", "heroNote": "...",
    "intro":    [{ "title": "", "body": "" }],
    "schedule": [{ "time": "", "title": "", "detail": "" }],
    "faq":      [{ "q": "", "a": "" }]
  },
  "perks": [{
    "id": "codex",              // links this credit to the per-person code below
    "name": "Codex", "kind": "AI PAIR PROGRAMMER",
    "value": "3 months Pro", "window": "REDEEM BEFORE 12 MAR",
    "blurb": "...", "redeemUrl": "https://...",
    "steps": ["Open the redeem link", "..."]
  }],
  "participants": [{
    "email": "ada@example.com",   // the lookup key — must be unique
    "name": "Ada Okonkwo", "team": "Team Driftwood", "ticket": "BUILDER",
    "status": "confirmed",        // confirmed | waitlist | cancelled
    "token": "CG-7K4M-QX21",      // the Common Ground token shown big on the page
    "codes":   { "codex": "CDX-8841-RRTP", "figma": "...", "mobbin": "..." },
    "claimed": { "codex": true,  "figma": false, "mobbin": false }
  }]
}
```

Only `status: "confirmed"` participants see credit cards. Everyone else gets a "nothing to redeem yet" state.

The **Import / export** panel downloads this whole record as JSON — hand that file to whoever wires up
the real backend, it is the schema.

## Turning this into the real thing

This is deliberately a wireframe. To make it production-ready:

1. **Replace the storage layer.** `CGData.load()` / `CGData.save()` in `assets/data.js` are the only two
   functions that touch `localStorage`. Point them at `GET /api/portal` and `PUT /api/portal` and nothing
   else in the codebase needs to change.
2. **Put a real check in front of the token.** Right now typing an email is enough. Email a magic link and
   render the token page only for a valid one — otherwise anyone can enumerate the roster.
3. **Put auth in front of `admin.html`.** It has no login at all, by design, so the wireframe is easy to click
   through. It must not ship as-is.
4. **Issue codes server-side.** The **Generate token + codes** button makes plausible-looking strings with
   `crypto.getRandomValues`. Real codes come from Codex / Figma / Mobbin and should be assigned to one
   person, once, and marked redeemed when used.
5. **Log redemptions.** The `claimed` flags are set by hand here. Track the real redeem-link click instead.

## Known wireframe limits

- Data lives in one browser. Another device, or a cleared cache, starts back at the sample roster.
- The redeem URLs point at `example.com`.
- No email sending, no magic links, no audit trail, no rate limiting on lookups.
- Sorting and pagination on the participants table are not built — search and status filter are.

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

## Code release and team drafts

In the organiser console, Event details → Codes available from defaults to 10 October 2026 at midnight WIB (Asia/Jakarta). A blank date enables immediate access in the current browser. Confirmed builders see tokens and redeemable codes on or after this date; waiting-list entries remain ineligible. This is a client-side prototype gate, not secure embargo enforcement: sample codes are included in the source. Real codes require an authenticated server with server-side release checks.

Once a confirmed builder has a token and every non-OpenAI configured tool code, the team section appears below the credits. OpenAI, Figma and Mobbin codes are claimed separately through Supabase. The builder is the team contact; they can save a team name and add/remove teammates with names and unique email addresses. Drafts are stored separately per contact in localStorage (`cg-team-draft-v1:<email>`), survive reloads, and are not sent to organisers or included in the organiser JSON export. Central collection requires a backend or submission service. Changing the release date in the organiser console affects only that browser; publish the seed setting to change it for everyone.


## Central project submissions

Builders sign in with a one-time email link and save their team and project drafts to Supabase. They can mark a submission ready once it has a team name, project name, description, and at least one HTTP(S) link. The organiser inbox is `submissions.html`; only organiser emails can read all rows. Database policies restrict builders to their own row and require their email to be on the eligible-participant list. Existing browser drafts remain local until the builder saves them after signing in.

### Supabase setup

1. In the Supabase SQL Editor, run [`supabase/schema.sql`](supabase/schema.sql).
2. In Supabase Authentication → URL Configuration, set the Site URL to the deployed GitHub Pages URL and allow redirects to `https://thisisshaw-04.github.io/Common-Ground-Makeathon/index.html` and `https://thisisshaw-04.github.io/Common-Ground-Makeathon/submissions.html`. Add `http://localhost:5180/**` for local development.
3. Add organiser emails in the SQL Editor, replacing the example with each organiser's lower-case email:
   ```sql
   insert into public.organizers (email) values ('organizer@example.com')
   on conflict (email) do nothing;
   ```
4. Import a one-column CSV of confirmed builders' lower-case emails into `public.eligible_participants`. Do not add waitlisted or cancelled registrations.
5. The browser client uses the project's URL and publishable key in `assets/backend-config.js`. The publishable key is expected to be public; never put a Supabase secret or service-role key in the site.
6. Tool code values are stored only in `private.tool_code_inventory` in Supabase. The builder page calls `claim_tool_code(tool)` after email sign-in; the first 100 approved builders to claim each pool receive a slot, and repeat requests retrieve the same value. OpenAI has 100 unique links; Figma and Mobbin have shared offers capped at 100 claims each. Do not commit code values to GitHub.

Supabase Auth must be configured for the deployed site before magic links can return to it. The browser uses Supabase RLS and the publishable key; no privileged key is shipped to GitHub Pages.
