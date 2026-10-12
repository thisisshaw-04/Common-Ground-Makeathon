/* People’s Choice voting inside the public project gallery. */
(function () {
  'use strict';
  var EVENT_ID = 'common-ground-2026-10-11';
  var client = window.CGSubmission && window.CGSubmission.client;
  var area = document.getElementById('people-choice-area');
  var message = document.getElementById('people-choice-message');
  var signInForm = document.getElementById('people-choice-signin-form');
  var signInCodeForm = document.getElementById('people-choice-code-form');
  var signInEmail = document.getElementById('people-choice-email');
  var signInCode = document.getElementById('people-choice-code');
  var signInStatus = document.getElementById('people-choice-auth-status');
  var changeEmail = document.getElementById('people-choice-change-email');
  var pendingEmail = '';
  var cards = document.getElementById('project-gallery-cards');
  var eligible = false;
  var isParticipant = false;
  var isOrganizer = false;
  var voteStatusResolved = false;
  var session = window.CGSubmission && window.CGSubmission.getSession();
  var eventStatus = window.CGEventStatus || {};
  var votedIds = [];
  var votesCast = 0;
  var statusRequest = 0;
  var phaseLabel = document.getElementById('gallery-phase-label');
  var VOTING_START_AT = Date.parse('2026-10-12T18:00:00+08:00');
  var VOTING_END_AT = Date.parse('2026-10-14T23:59:59+08:00');

  function setMessage(text, isError) {
    message.textContent = text || '';
    message.classList.toggle('error', !!isError);
  }
  function renderVoteButtons() {
    if (!cards) return;
    cards.querySelectorAll('[data-vote-actions]').forEach(function (node) { node.remove(); });
    if (!eventStatus.voting_open || !session || !session.user || !voteStatusResolved) return;
    var voted = new Set(votedIds);
    var limit = eligible ? 3 : 1;
    var remaining = Math.max(0, limit - votesCast);
    cards.querySelectorAll('.project-gallery-card[data-submission-id]').forEach(function (card) {
      var id = card.getAttribute('data-submission-id');
      var isMyTeam = card.getAttribute('data-is-my-team') === 'true';
      var alreadyVoted = voted.has(id);
      var buttonText = isMyTeam ? 'Your team' : alreadyVoted ? 'Unvote' : remaining === 0 ? 'Limit reached' : 'Vote for this project';
      var disabled = isMyTeam || (!alreadyVoted && remaining === 0);
      var actions = document.createElement('div');
      actions.className = 'gallery-vote-actions';
      actions.setAttribute('data-vote-actions', '');
      actions.innerHTML = '<button class="btn btn-primary" type="button" data-vote-project="' +
        String(id).replace(/[&<>"']/g, '') + '"' + (disabled ? ' disabled' : '') + '>' +
        buttonText + '</button>';
      card.appendChild(actions);
    });
  }
  function updatePhaseLabel() {
    if (!phaseLabel) return;
    var now = Date.parse(eventStatus.current_at || '');
    if (!Number.isFinite(now)) now = Date.now();
    phaseLabel.textContent = eventStatus.voting_open
      ? 'VOTING OPEN'
      : now >= VOTING_END_AT ? 'VOTING CLOSED'
        : now >= VOTING_START_AT ? 'VOTING PAUSED'
          : 'EDITING OPEN';
  }
  function renderState() {
    updatePhaseLabel();
    area.hidden = false;
    renderSignInState();
    if (!eventStatus.gallery_open) return;
    if (!session || !session.user) {
      setMessage('Sign in to vote after 6:00 PM SGT. Participant-list emails and organisers get 3 votes; other verified emails get 1.');
    } else if (!voteStatusResolved) {
      setMessage('Checking your sign-in and vote limit…');
    } else if (!eventStatus.voting_open) {
      var now = Date.parse(eventStatus.current_at || '');
      var votingStart = VOTING_START_AT;
      var votingEnd = Date.parse('2026-10-14T23:59:59+08:00');
      setMessage(Number.isFinite(now) && now >= votingEnd
        ? 'Voting closed at 11:59 PM SGT Wednesday, 14 October.'
        : Number.isFinite(now) && now < votingStart
          ? 'Voting opens at 6:00 PM SGT Monday, 12 October and closes at 11:59 PM Wednesday, 14 October.'
          : 'Voting is paused by the organisers.');
    } else if (votesCast >= (eligible ? 3 : 1)) {
      setMessage(eligible
        ? 'You’ve used all three votes. Unvote a project to free a slot.'
        : 'You’ve used your one vote. Unvote a project to free the slot.');
    } else {
      var limit = eligible ? 3 : 1;
      var remaining = limit - votesCast;
      setMessage('Choose up to ' + limit + ' different project' + (limit === 1 ? '' : 's') + '. ' +
        remaining + ' ' + (remaining === 1 ? 'vote' : 'votes') + ' left.');
    }
    renderVoteButtons();
  }
  async function refreshStatus() {
    var sequence = ++statusRequest;
    if (!client || !session || !session.user) {
      votesCast = 0;
      votedIds = [];
      eligible = false;
      isParticipant = false;
      isOrganizer = false;
      voteStatusResolved = false;
      renderState();
      return;
    }
    voteStatusResolved = false;
    try {
      var eligibilityChecks = await Promise.all([
        client.rpc('is_current_user_eligible'),
        client.rpc('is_current_user_organizer')
      ]);
      if (sequence !== statusRequest) return;
      if (eligibilityChecks[0].error) throw eligibilityChecks[0].error;
      if (eligibilityChecks[1].error) throw eligibilityChecks[1].error;
      isParticipant = eligibilityChecks[0].data === true;
      isOrganizer = eligibilityChecks[1].data === true;
      eligible = isParticipant || isOrganizer;
      var result = await client.rpc('get_people_choice_status', {p_event_id: EVENT_ID});
      if (sequence !== statusRequest) return;
      if (result.error) throw result.error;
      var row = Array.isArray(result.data) ? result.data[0] : result.data;
      row = row || {};
      votesCast = Number(row.votes_cast || 0);
      votedIds = Array.isArray(row.voted_submission_ids) ? row.voted_submission_ids : [];
      eventStatus = Object.assign({}, window.CGEventStatus || {}, {
        voting_open: !!row.voting_open && (!!(window.CGEventStatus && window.CGEventStatus.voting_open) || eligible)
      });
      voteStatusResolved = true;
      renderState();
    } catch (_error) {
      if (sequence !== statusRequest) return;
      eligible = false;
      isParticipant = false;
      isOrganizer = false;
      voteStatusResolved = false;
      setMessage('Could not load your vote status. Refresh and try again.', true);
      renderVoteButtons();
    }
  }
  if (cards) cards.addEventListener('click', async function (event) {
    var button = event.target.closest('[data-vote-project]');
    if (!button || button.disabled || !client || !session || !session.user) return;
    var submissionId = button.getAttribute('data-vote-project');
    var removingVote = votedIds.indexOf(submissionId) !== -1;
    button.disabled = true;
    setMessage(removingVote ? 'Removing your vote…' : 'Recording your vote…');
    try {
      var result = await client.rpc(removingVote ? 'remove_people_choice_vote' : 'cast_people_choice_vote', {
        p_submission_id: submissionId,
        p_event_id: EVENT_ID
      });
      if (result.error) throw result.error;
      await refreshStatus();
    } catch (error) {
      button.disabled = false;
      var detail = String(error && error.message || '').toLowerCase();
      if (removingVote) {
        setMessage(detail.indexOf('not voted') >= 0
          ? 'This vote is already removed. Refresh to update the gallery.'
          : 'Could not remove your vote. Refresh and try again; voting may have closed.', true);
        return;
      }
      setMessage(detail.indexOf('already voted') >= 0
        ? 'You already voted for this project.'
        : detail.indexOf('own team') >= 0
          ? 'You cannot vote for a project from your team.'
          : detail.indexOf('three votes') >= 0
            ? 'You’ve used all three votes.'
            : 'Your vote was not recorded. Voting may have closed. Refresh and try again.', true);
    }
  });
  document.addEventListener('cg-gallery-loaded', renderVoteButtons);
  document.addEventListener('cg-event-status', function (event) {
    eventStatus = event.detail || {};
    if (session && session.user) {
      voteStatusResolved = false;
      renderState();
      refreshStatus();
    } else {
      renderState();
    }
  });
  function renderSignInState() {
    var user = session && session.user;
    if (signInForm) signInForm.hidden = !!user || !!pendingEmail;
    if (signInCodeForm) signInCodeForm.hidden = !!user || !pendingEmail;
    if (changeEmail) changeEmail.hidden = !!user || !pendingEmail;
    if (signInStatus && user) {
      signInStatus.textContent = !voteStatusResolved
        ? 'Signed in as ' + String(user.email || 'your email') + '. Checking your vote limit…'
        : eligible
          ? 'Signed in as ' + String(user.email || 'your email') + '. ' +
            (isParticipant && isOrganizer ? 'Participant and organiser accounts get up to 3 votes.' :
              isOrganizer ? 'Organisers get up to 3 votes.' : 'Participant-list emails get up to 3 votes.')
          : 'Signed in as ' + String(user.email || 'your email') + '. This email gets 1 vote after voting opens.';
    }
  }
  if (signInForm) signInForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    var email = String(signInEmail && signInEmail.value || '').trim().toLowerCase();
    if (!email || !signInEmail || !signInEmail.checkValidity()) {
      if (signInEmail) signInEmail.reportValidity();
      return;
    }
    var button = signInForm.querySelector('button[type="submit"]');
    if (button) button.disabled = true;
    if (signInStatus) {
      signInStatus.textContent = 'Sending a sign-in email…';
      signInStatus.classList.remove('error');
    }
    try {
      if (!window.CGSubmission || !window.CGSubmission.signIn) throw new Error('Sign-in is not configured.');
      try { localStorage.setItem('cg-return-to-choice-after-signin', String(Date.now())); } catch (_err) { /* The email code still works without storage. */ }
      await window.CGSubmission.signIn(email, {returnToPanel: 'choice'});
      pendingEmail = email;
      if (signInStatus) {
        signInStatus.textContent = 'Enter the newest eight-digit code from your email.';
        signInStatus.classList.remove('error');
      }
      if (signInCode) signInCode.value = '';
      renderSignInState();
      if (signInCode) signInCode.focus();
    } catch (error) {
      if (signInStatus) signInStatus.textContent = window.CGSubmission && window.CGSubmission.signInErrorMessage
        ? window.CGSubmission.signInErrorMessage(error)
        : 'Could not send a sign-in email. Please try again.';
      if (signInStatus) signInStatus.classList.add('error');
    } finally {
      if (button) button.disabled = false;
    }
  });
  if (signInCodeForm) signInCodeForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    var code = String(signInCode && signInCode.value || '').replace(/\D/g, '');
    if (!pendingEmail || !/^\d{8}$/.test(code)) {
      if (signInStatus) {
        signInStatus.textContent = 'Enter the eight-digit code from your newest email.';
        signInStatus.classList.add('error');
      }
      if (signInCode) signInCode.focus();
      return;
    }
    var button = signInCodeForm.querySelector('button[type="submit"]');
    if (button) button.disabled = true;
    if (signInStatus) {
      signInStatus.textContent = 'Verifying your code…';
      signInStatus.classList.remove('error');
    }
    try {
      await window.CGSubmission.verifyEmailCode(pendingEmail, code);
      if (signInStatus) signInStatus.textContent = 'Code verified. Loading your votes…';
    } catch (_error) {
      if (signInCode) signInCode.value = '';
      if (signInStatus) {
        signInStatus.textContent = 'That code is invalid, expired, or already used. Request a fresh code and enter the newest one.';
        signInStatus.classList.add('error');
      }
    } finally {
      if (button) button.disabled = false;
    }
  });
  if (signInCode) signInCode.addEventListener('input', function () {
    this.value = this.value.replace(/\D/g, '').slice(0, 8);
  });
  if (changeEmail) changeEmail.addEventListener('click', function () {
    pendingEmail = '';
    if (signInStatus) {
      signInStatus.textContent = '';
      signInStatus.classList.remove('error');
    }
    if (signInCode) signInCode.value = '';
    renderSignInState();
    if (signInEmail) signInEmail.focus();
  });
  document.addEventListener('cg-submission-auth', function (event) {
    session = event.detail && event.detail.session || null;
    renderSignInState();
    refreshStatus();
    if (session && session.user) {
      var returnToChoice = false;
      try {
        var requestedAt = Number(localStorage.getItem('cg-return-to-choice-after-signin'));
        returnToChoice = Number.isFinite(requestedAt) && Date.now() - requestedAt < 30 * 60 * 1000;
        if (returnToChoice) localStorage.removeItem('cg-return-to-choice-after-signin');
      } catch (_err) { /* Keep voting available even if storage is blocked. */ }
      if (returnToChoice) {
        window.setTimeout(function () {
          var choiceTab = document.getElementById('nav-choice');
          if (choiceTab) choiceTab.click();
        }, 0);
      }
    }
  });
  document.addEventListener('cg-builder-eligibility', function () {
    refreshStatus();
  });
  if (window.CGSubmission) {
    window.CGSubmission.ready.then(function (nextSession) {
      session = nextSession;
      renderSignInState();
      refreshStatus();
    }).catch(function () { renderState(); });
  } else {
    renderState();
  }
})();
