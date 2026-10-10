/* Common Ground — published event data layer.
   Published event copy lives here; eligibility, offers, submissions, and voting live in Supabase.
*/
(function (global) {
  const SEED = {
    eventRevision: '2026-10-11-v2',
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
          body: 'Verified attendees can claim limited partner offers from this page. Each code pool is first come, first served. You will also find food, a desk, power, and people who know things you do not.' },
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
        { q: 'I signed up with a different email.', a: 'Use the address on your confirmation email. If that still fails, find us at the front desk and we will merge the records.' },
        { q: 'Do I need a team before Sunday?', a: 'No. Come with a team or meet one during the morning kick-off.' },
        { q: 'How do the partner offers work?', a: 'Sign in with your approved registration email. Each limited code or link is claimed first come, first served, and repeat claims return your reserved offer.' },
        { q: 'Can I bring existing work?', a: 'Bring libraries, components and boilerplate. Do not bring a finished product.' }
      ]
    },
  };

  function clone(v) { return JSON.parse(JSON.stringify(v)); }

  const CGData = {
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
    load: function () { return clone(SEED); },
    save: function () { return false; },
    reset: function () { return clone(SEED); }
  };

  global.CGData = CGData;
})(window);
