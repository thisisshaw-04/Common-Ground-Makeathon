/* Common Ground — published event data layer.
   Published event copy lives here; eligibility, offers, submissions, and voting live in Supabase.
*/
(function (global) {
  const SEED = {
    eventRevision: '2026-10-12-media-edit-vote-window',
    event: {
      name: 'Common Ground',
      edition: 'MAKEATHON',
      tagline: 'A one-day makeathon where design, technology and culture meet.',
      dates: 'SUNDAY, 11 OCTOBER 2026',
      venue: 'SQ Collective',
      hours: '9:00 AM — 5:00 PM',
      codesAvailableOn: '2026-10-10',
      heroNote: 'Bring what you know unusually well. Someone else will bring what you don’t.',
      intro: [
        { title: 'What this is',
          body: 'A day at SQ Collective to experiment where design, technology and culture meet. Work solo or in a team of up to three, then share what you made.' },
        { title: 'What you get',
          body: 'All backgrounds and skill levels are welcome; no coding experience is needed. Claim limited partner offers here, then find teammates with skills and perspectives different from yours.' },
        { title: 'What we ask',
          body: 'Bring a laptop, internet access and a charger. There is no fixed medium: make a website, visual experiment, AI experience, speculative prototype or something new.' }
      ],
      schedule: [
        { time: '09:00', title: 'Check-in', detail: 'Arrive, collect your badge, and get settled at SQ Collective.' },
        { time: '09:30', title: 'Welcome + team forming', detail: 'Hear the brief and find your team.' },
        { time: '10:00', title: 'Build session 01', detail: 'Choose a problem and start building.' },
        { time: '12:00', title: 'Lunch', detail: 'Take a break and meet other teams.' },
        { time: '13:00', title: 'Build session 02', detail: 'Test the idea, get feedback, and keep building.' },
        { time: '14:30', title: 'Final sprint', detail: 'Finish the essentials and prepare your demo.' },
        { time: '15:15', title: 'Gallery opens · Final edit window', detail: 'Ready submissions appear in the public gallery. People’s Choice voting opens at 12:00 PM SGT on Monday, 12 October.' },
        { time: '15:30', title: 'Submission window continues', detail: 'New entries and updates stay open until an organiser closes submissions.' },
        { time: '16:00', title: 'Demos + judging', detail: 'Present your build and what you learned.' },
        { time: '16:45', title: 'Wrap-up', detail: 'Share next steps and celebrate the work.' },
        { time: '17:00', title: 'Event ends · People’s Choice voting later', detail: 'The makeathon ends. Voting runs from 12:00 PM Monday, 12 October to 11:59 PM Wednesday, 14 October SGT.' }
      ],
      faq: [
        { q: 'Which email should I use?', a: 'Use the email on your event registration.' },
        { q: 'Can I join without a team?', a: 'Yes. Register individually and meet people at the 9:30 kick-off. Teams can have up to three people.' },
        { q: 'Do I need to know how to code?', a: 'No. All backgrounds and skill levels are welcome. Bring what you know unusually well.' },
        { q: 'What can we make?', a: 'There is no fixed medium or outcome. Build a website, visual experiment, AI experience, speculative prototype or something else.' },
        { q: 'How do partner offers work?', a: 'Sign in and claim each offer. Claims are limited and first come, first served.' },
        { q: 'Can I update my project?', a: 'Existing project teams can update only the preview image, live demo, and demo video links from 12:00 PM to 6:00 PM SGT on Monday, 12 October. New project entries are closed. After 6:00 PM, only voting remains open.' },
        { q: 'How does People’s Choice work?', a: 'Sign in with any verified email. Approved event builders can cast up to three votes; other verified email accounts can cast one. Voting runs from 12:00 PM SGT Monday, 12 October to 11:59 PM Wednesday, 14 October. You can unvote before voting closes, but cannot vote for your own team.' },
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
