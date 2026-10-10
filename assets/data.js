/* Common Ground — portal wireframe data layer.
   Everything lives in localStorage so the admin portal and the front portal
   share one source of truth. Swap this file for real API calls later:
   CGData.load()  -> GET  /api/portal
   CGData.save(d) -> PUT  /api/portal
*/
(function (global) {
  const STORE_KEY = 'cg-portal-v1';

  const SEED = {
    eventRevision: '2026-10-11',
    event: {
      name: 'Common Ground',
      edition: 'EDITION 01 / 2026',
      tagline: 'A one-day makeathon for people who would rather build the thing than describe it.',
      dates: 'SUNDAY, 11 OCTOBER 2026',
      venue: 'SQ Collective',
      hours: '9:00 AM — 5:00 PM',
      codesAvailableOn: '2026-10-10',
      heroNote: 'Bring a problem you actually have. Leave with something that runs.',
      intro: [
        { title: 'What this is',
          body: 'One Sunday. One thing worth making. Join us at SQ Collective on 11 October, from 9am to 5pm. Kick off together, find your team, build, and share what you made before the day is out.' },
        { title: 'What you get',
          body: 'Approved attendees sign in with their registration email to submit a project, claim available tool offers and vote in People’s Choice. The roster and promo links are kept private in Supabase.' },
        { title: 'What we ask',
          body: 'Build in the open. Help the team next to you when they are stuck. Ship something honest on Sunday, even if it is held together with tape.' }
      ],
      schedule: [
        { time: '09:00', title: 'Welcome + check-in', detail: 'Arrive at SQ Collective, pick up your badge, and get set up.' },
        { time: '09:30', title: 'Kick-off + team forming', detail: 'Meet the builders, hear the brief, and choose a problem worth solving.' },
        { time: '10:00', title: 'Build session 01', detail: 'Sketch your idea, divide up the work, and start making.' },
        { time: '12:00', title: 'Lunch break', detail: 'Take a breather and swap ideas with the other teams.' },
        { time: '13:00', title: 'Build session 02', detail: 'Keep building, test your idea, and ask for feedback.' },
        { time: '14:30', title: 'Checkpoint + final sprint', detail: 'Check your progress, focus on the essentials, and prepare your demo.' },
        { time: '16:00', title: 'Demos + sharing', detail: 'Show what you made and share what you learned.' },
        { time: '16:45', title: 'Wrap-up + next steps', detail: 'Celebrate the builds, exchange contacts, and plan what comes next.' },
        { time: '17:00', title: 'Close', detail: 'That is a wrap. Keep building in the open.' }
      ],
      faq: [
        { q: 'I can’t access the builder workspace.', a: 'Use the exact email on your approved attendee registration. If you have trouble, contact an organiser.' },
        { q: 'Do I need a team before Sunday?', a: 'No. Come with a team or meet one during the morning kick-off.' },
        { q: 'How long do the tool credits last?', a: 'Each credit has its own window — check the card. Redeem them before the event, not during.' },
        { q: 'Can I bring existing work?', a: 'Bring libraries, components and boilerplate. Do not bring a finished product.' }
      ]
    },

    /* Promo claim inventory is private in Supabase. */
    perks: [],

    /* The approved attendee roster stays private in Supabase. */
    participants: []
  };

  function clone(v) { return JSON.parse(JSON.stringify(v)); }

  const CGData = {
    STORE_KEY,
    codesOpen: function (event, now) {
      const date = event.codesAvailableOn;
      if (!date) return true;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
      return (now == null ? Date.now() : now) >= Date.parse(date + 'T00:00:00+07:00');
    },
    releaseLabel: function (event) {
      if (!event.codesAvailableOn) return 'Available now';
      const date = new Date(event.codesAvailableOn + 'T00:00:00+07:00');
      return Number.isNaN(date.getTime()) ? 'Release date to be confirmed' :
        new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' }).format(date) + ' · 00:00 WIB';
    },
    seed: function () { return clone(SEED); },

    load: function () {
      try {
        const raw = localStorage.getItem(STORE_KEY);
        if (!raw) return clone(SEED);
        const parsed = JSON.parse(raw);
        // Refresh published event details once, retaining participant and credit records.
        if (parsed.eventRevision !== SEED.eventRevision) {
          parsed.event = Object.assign({}, parsed.event || {}, clone(SEED.event));
          delete parsed.event.capacity;
          parsed.eventRevision = SEED.eventRevision;
          if (Array.isArray(parsed.perks)) parsed.perks.forEach(function (perk) {
            if (perk.window === 'REDEEM BEFORE 12 MAR') perk.window = 'REDEEM BEFORE THE EVENT';
          });
          localStorage.setItem(STORE_KEY, JSON.stringify(parsed));
        }
        // Shallow repair so a half-written record never blanks the portal.
        return {
          eventRevision: SEED.eventRevision,
          event: Object.assign(clone(SEED.event), parsed.event || {}),
          perks: Array.isArray(parsed.perks) ? parsed.perks : clone(SEED.perks),
          participants: Array.isArray(parsed.participants) ? parsed.participants : clone(SEED.participants)
        };
      } catch (err) {
        console.warn('Common Ground: falling back to seed data.', err);
        return clone(SEED);
      }
    },

    save: function (data) {
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(data));
        return true;
      } catch (err) {
        console.warn('Common Ground: could not save.', err);
        return false;
      }
    },

    reset: function () {
      try { localStorage.removeItem(STORE_KEY); } catch (err) { /* private mode */ }
      return clone(SEED);
    },

    findByEmail: function (data, email) {
      const needle = String(email || '').trim().toLowerCase();
      if (!needle) return null;
      return data.participants.find(function (p) {
        return String(p.email || '').trim().toLowerCase() === needle;
      }) || null;
    }
  };

  global.CGData = CGData;
})(window);
