/* People’s Choice voting inside the public project gallery. */
(function () {
  'use strict';
  var EVENT_ID = 'common-ground-2026-10-11';
  var client = window.CGSubmission && window.CGSubmission.client;
  var area = document.getElementById('people-choice-area');
  var message = document.getElementById('people-choice-message');
  var signIn = document.getElementById('people-choice-signin');
  var cards = document.getElementById('project-gallery-cards');
  var eligible = window.CGBuilderEligibility === true;
  var session = window.CGSubmission && window.CGSubmission.getSession();
  var eventStatus = window.CGEventStatus || {};
  var votedIds = [];
  var votesCast = 0;
  var statusRequest = 0;

  function setMessage(text, isError) {
    message.textContent = text || '';
    message.classList.toggle('error', !!isError);
  }
  function renderVoteButtons() {
    if (!cards) return;
    cards.querySelectorAll('[data-vote-actions]').forEach(function (node) { node.remove(); });
    if (!eventStatus.voting_open || !eligible || !session || !session.user) return;
    var voted = new Set(votedIds);
    var remaining = Math.max(0, 3 - votesCast);
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
  function renderState() {
    area.hidden = !eventStatus.gallery_open;
    signIn.hidden = !!(session && session.user) || eligible;
    if (!eventStatus.gallery_open) return;
    if (!session || !session.user) {
      setMessage('Sign in with your approved event email in Part A to vote.');
    } else if (!eligible) {
      setMessage('Use an approved event email to vote.', true);
    } else if (!eventStatus.voting_open) {
      var now = Date.parse(eventStatus.current_at || '');
      var eventEnd = Date.parse('2026-10-11T17:00:00+08:00');
      setMessage(Number.isFinite(now) && now >= eventEnd
        ? 'Voting closed at 5:00 PM SGT.'
        : 'Voting is paused by the organisers.');
    } else if (votesCast >= 3) {
      setMessage('You’ve used all three votes. Unvote a project to free a slot.');
    } else {
      setMessage('Choose up to three different projects. ' + (3 - votesCast) + ' ' +
        (3 - votesCast === 1 ? 'vote' : 'votes') + ' left.');
    }
    renderVoteButtons();
  }
  async function refreshStatus() {
    var sequence = ++statusRequest;
    if (!client || !eligible || !session || !session.user) {
      votesCast = 0;
      votedIds = [];
      renderState();
      return;
    }
    try {
      var result = await client.rpc('get_people_choice_status', {p_event_id: EVENT_ID});
      if (sequence !== statusRequest) return;
      if (result.error) throw result.error;
      var row = Array.isArray(result.data) ? result.data[0] : result.data;
      row = row || {};
      votesCast = Number(row.votes_cast || 0);
      votedIds = Array.isArray(row.voted_submission_ids) ? row.voted_submission_ids : [];
      eventStatus.voting_open = !!row.voting_open && !!(window.CGEventStatus && window.CGEventStatus.voting_open);
      renderState();
    } catch (_error) {
      if (sequence !== statusRequest) return;
      setMessage('Could not load your vote status. Refresh and try again.', true);
      renderVoteButtons();
    }
  }
  if (cards) cards.addEventListener('click', async function (event) {
    var button = event.target.closest('[data-vote-project]');
    if (!button || button.disabled || !client || !eligible) return;
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
    renderState();
  });
  document.addEventListener('cg-submission-auth', function (event) {
    session = event.detail && event.detail.session || null;
    refreshStatus();
  });
  document.addEventListener('cg-builder-eligibility', function (event) {
    eligible = !!(event.detail && event.detail.eligible);
    refreshStatus();
  });
  if (window.CGSubmission) {
    window.CGSubmission.ready.then(function (nextSession) {
      session = nextSession;
      refreshStatus();
    }).catch(function () { renderState(); });
  } else {
    renderState();
  }
})();
