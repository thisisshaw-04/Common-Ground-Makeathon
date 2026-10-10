/* Eligible attendee People’s Choice ballot. The database enforces one vote per user. */
(function () {
  'use strict';
  var EVENT_ID = 'common-ground-2026-10-11';
  var $ = function (id) { return document.getElementById(id); };
  var client = window.CGSubmission && window.CGSubmission.client;
  var finalists = [];
  var sequence = 0;
  function escape(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function safeHref(value) {
    try { var url = new URL(value); return /^https?:$/.test(url.protocol) ? url.href : ''; }
    catch (_err) { return ''; }
  }
  function message(text, isError) {
    $('vote-message').textContent = text || '';
    $('vote-message').classList.toggle('error', !!isError);
  }
  function links(row) {
    return [['Live demo', row.demo_url], ['Demo video', row.demo_video_url], ['Prototype', row.prototype_url]]
      .map(function (item) {
        var href = safeHref(item[1]);
        return href ? '<a href="' + escape(href) + '" target="_blank" rel="noopener noreferrer">' + escape(item[0]) + ' ↗</a>' : '';
      }).filter(Boolean).join('');
  }
  function renderCards(myVote, votingOpen) {
    $('vote-count').textContent = finalists.length + ' FINALISTS';
    $('vote-lock').hidden = votingOpen;
    $('vote-lock').textContent = votingOpen ? '' : 'People’s Choice voting is closed or has not opened yet. Check back when the organisers announce the vote.';
    $('vote-cards').innerHTML = finalists.map(function (row) {
      var selected = myVote && row.submission_id === myVote;
      var linkHtml = links(row);
      var disabled = !votingOpen || !!myVote;
      return '<article class="vote-card' + (selected ? ' selected' : '') + '">' +
        '<span class="team">' + escape(row.team_name) + '</span>' +
        '<h2>' + escape(row.project_name) + '</h2>' +
        (row.one_liner ? '<p><strong>' + escape(row.one_liner) + '</strong></p>' : '') +
        (row.project_overview ? '<p>' + escape(row.project_overview) + '</p>' : '') +
        (linkHtml ? '<div class="links">' + linkHtml + '</div>' : '') +
        (selected ? '<p class="team">YOUR VOTE</p>' : '') +
        (votingOpen && !myVote ? '<button class="btn btn-primary" type="button" data-vote="' + escape(row.submission_id) + '">Vote for this project</button>' : '') +
        '</article>';
    }).join('');
  }
  async function loadBallot(session) {
    var request = ++sequence;
    $('vote-signout').hidden = !(session && session.user);
    $('vote-panel').hidden = true;
    if (!session || !session.user) {
      $('vote-login').hidden = false;
      message(client ? 'Sign in using the email address you used to register.' : 'Supabase is not configured on this site.', !client);
      return;
    }
    $('vote-login').hidden = true;
    $('vote-email').value = session.user.email || '';
    if (!client) { message('Supabase is not configured on this site.', true); return; }
    message('Checking your attendee access…');
    try {
      var statusResult = await client.rpc('get_people_choice_status', {p_event_id:EVENT_ID});
      if (request !== sequence) return;
      if (statusResult.error) throw statusResult.error;
      var status = Array.isArray(statusResult.data) ? statusResult.data[0] : statusResult.data;
      if (!status) throw new Error('Could not load voting status.');
      var finalResult = await client.rpc('get_people_choice_finalists', {p_event_id:EVENT_ID});
      if (request !== sequence) return;
      if (finalResult.error) throw finalResult.error;
      finalists = finalResult.data || [];
      $('vote-panel').hidden = false;
      renderCards(status.my_vote, status.voting_open);
      if (!status.finalist_count) {
        $('vote-cards').innerHTML = '';
        $('vote-lock').hidden = false;
        $('vote-lock').textContent = 'The organisers have not published the finalist list yet.';
        message('You are signed in, but voting is not ready yet.');
      } else if (status.my_vote) {
        var choice = finalists.find(function (row) { return row.submission_id === status.my_vote; });
        message(status.voting_open
          ? 'Your vote is recorded for ' + (choice ? choice.project_name : 'your selected project') + '. It cannot be changed.'
          : 'Voting is closed. Your ballot was recorded.');
      } else if (status.voting_open) {
        message('You are verified as an eligible attendee. Choose one finalist; your vote is final.');
      } else {
        message('You are verified as an eligible attendee. Voting is not open yet.');
      }
    } catch (_err) {
      if (request !== sequence) return;
      $('vote-panel').hidden = true;
      message('We could not verify your attendee access. Use the registration email on the approved builder list, or contact an organiser.', true);
    }
  }
  $('vote-login').addEventListener('submit', async function (event) {
    event.preventDefault();
    if (!window.CGSubmission || !client) { message('Supabase is not configured on this site.', true); return; }
    var email = $('vote-email').value.trim().toLowerCase();
    if (!email) { message('Enter your approved registration email.', true); return; }
    try {
      await window.CGSubmission.signIn(email);
      message('If this is your registration email, a one-time sign-in link is on its way. Open it here to continue.');
    } catch (_err) { message('Could not send the sign-in link. Check the address and try again in a minute.', true); }
  });
  $('vote-signout').addEventListener('click', async function () {
    try { await window.CGSubmission.signOut(); }
    catch (_err) { message('Could not sign out. Reload the page and try again.', true); }
  });
  document.addEventListener('click', async function (event) {
    var button = event.target.closest('[data-vote]');
    if (!button || !client) return;
    button.disabled = true;
    message('Recording your vote…');
    try {
      var result = await client.rpc('cast_people_choice_vote', {
        p_submission_id: button.getAttribute('data-vote'),
        p_event_id: EVENT_ID
      });
      if (result.error) throw result.error;
      await loadBallot(window.CGSubmission.getSession());
    } catch (error) {
      button.disabled = false;
      message(error && error.message && error.message.indexOf('already cast') >= 0
        ? 'A vote has already been recorded for this account.'
        : 'We could not record your vote. Voting may have closed; refresh and try again.', true);
    }
  });
  document.addEventListener('cg-submission-auth', function (event) {
    loadBallot(event.detail && event.detail.session);
  });
  if (!client) { loadBallot(null); return; }
  window.CGSubmission.ready.then(loadBallot).catch(function () { message('Supabase could not start. Reload the page and try again.', true); });
})();