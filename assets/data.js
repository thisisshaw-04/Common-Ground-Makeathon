/* Common Ground — published event data layer.
   Published event copy lives here; eligibility, offers, submissions, and voting live in Supabase.
*/
(function (global) {
  const SEED = {
    eventRevision: '2026-10-11-v2',
    event: {
      name: 'Common Ground',
      edition: 'MAKEATHON',
      tagline: 'A one-day makeathon. One idea. Built together.',
      dates: 'SUNDAY, 11 OCTOBER 2026',
      venue: 'SQ Collective',
      hours: '9:00 AM — 5:00 PM',
      codesAvailableOn: '2026-10-10',
      heroNote: 'Build it. Show how it works.',
      intro: [
        { title: 'What this is',
          body: 'One thing worth making. Join us at SQ Collective on 11 October, from 9am to 5pm. Kick off together, find your team, build, and share what you made before the day is out.' },
        { title: 'What you get',
          body: 'Verified attendees can claim limited partner offers from this page. Each code pool is first come, first served. You will also find food, a desk, power, and people who know things you do not.' },
        { title: 'What we ask',
          body: 'Build in the open. Help the team next to you when they are stuck. Ship something honest on Sunday, even if it is held together with tape.' }
      ],
      schedule: [
        { time: '09:00', title: 'Check-in', detail: 'Arrive, collect your badge, and get settled at SQ Collective.' },
        { time: '09:30', title: 'Welcome + team forming', detail: 'Hear the brief and find your team.' },
        { time: '10:00', title: 'Build session 01', detail: 'Choose a problem and start building.' },
        { time: '12:00', title: 'Lunch', detail: 'Take a break and meet other teams.' },
        { time: '13:00', title: 'Build session 02', detail: 'Test the idea, get feedback, and keep building.' },
        { time: '14:30', title: 'Final sprint', detail: 'Finish the essentials and prepare your demo.' },
        { time: '15:15', title: 'Submissions close · Gallery opens', detail: 'Ready submissions appear in the public gallery. People’s Choice voting opens.' },
        { time: '16:00', title: 'Demos + judging', detail: 'Present your build and what you learned.' },
        { time: '16:45', title: 'Wrap-up', detail: 'Share next steps and celebrate the work.' },
        { time: '17:00', title: 'Event ends · Voting closes', detail: 'People’s Choice voting closes automatically.' }
      ],
      faq: [
        { q: 'Which email should I use?', a: 'Use the email on your event registration.' },
        { q: 'Can I join without a team?', a: 'Yes. Teams can form at the 9:30 kick-off.' },
        { q: 'How do partner offers work?', a: 'Sign in and claim each offer. Claims are limited and first come, first served.' },
        { q: 'When do submissions close?', a: '3:15 PM SGT on 11 October. Ready projects then appear in the public gallery.' },
        { q: 'How does People’s Choice work?', a: 'Sign in and vote for up to three projects from 3:15 to 5:00 PM SGT. You cannot vote for your own team.' },
        { q: 'Do I need source code?', a: 'Add a source link unless the project is no-code. Include a live demo or video.' }
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
