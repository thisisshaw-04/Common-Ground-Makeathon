/* Organiser-only submission inbox. Access is enforced by Supabase RLS. */
(function () {
  'use strict';
  var client = window.CGSubmission && window.CGSubmission.client;
  var allRows = [];
  var finalistIds = [];
  var votingOpen = false;
  var voteCount = 0;
  var $ = function (id) { return document.getElementById(id); };
  var escape = function (value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); };
  function safeHref(value) { try { var url = new URL(value); return /^https?:$/.test(url.protocol) ? escape(url.href) : ''; } catch (_err) { return ''; } }
  function message(text, error) {
    $('inbox-message').textContent = text;
    $('inbox-message').classList.toggle('error', !!error);
  }
  function render() {
    var status = $('inbox-filter').value;
    var rows = allRows.filter(function (row) { return !status || row.status === status; });
    $('inbox-count').textContent = rows.length + (rows.length === 1 ? ' SUBMISSION' : ' SUBMISSIONS');
    if (!rows.length) {
      $('inbox-cards').innerHTML = '<p class="helper">No submissions match this filter yet.</p>';
      return;
    }
    $('inbox-cards').innerHTML = rows.map(function (row) {
      var project = row.project || {}, team = row.team || {};
      var members = Array.isArray(team.members) ? team.members : [];
      var linkItems = [
        ['Live demo', project.demo], ['Demo video', project.video], ['Source code', project.source],
        ['Figma / prototype', project.prototype]
      ];
      var links = linkItems.map(function (item) {
        var href = item[1] && safeHref(item[1]);
        return href ? '<a href="' + href + '" target="_blank" rel="noopener noreferrer">' + escape(item[0]) + ' ↗</a>' : '';
      }).join('');
      if (project.supporting) {
        links += (links ? ' ' : '') + '<span>' + escape(project.supporting) + '</span>';
      }
      var labels = {
        oneLiner:'One-liner', inspiration:'Problem / inspiration', solution:'Solution', interesting:'What makes it interesting?',
        technology:'Technology used', made:'What works now', experiment:'Experiment / learning', next:'What they would do next',
        designReflection:'Design × Tech reflection', cultureReflection:'Culture × Tech reflection',
        collaboration:'Team & collaboration', attribution:'AI & tool attribution'
      };
      var fieldOrder = ['oneLiner','inspiration','solution','interesting','technology','made','experiment','next','designReflection','cultureReflection','collaboration','attribution'];
      var fields = fieldOrder.filter(function (key) { return project[key]; }).map(function (key) {
        return '<section class="submission-detail"><strong>' + escape(labels[key]) + '</strong><p>' + escape(project[key]) + '</p></section>';
      }).join('');
      var tracks = Array.isArray(project.tracks) ? project.tracks : [];
      var memberNames = members.map(function (member) {
        return escape(member.name || '') + (member.email ? ' · ' + escape(member.email) : '');
      }).filter(Boolean).join('<br>');
      return '<article class="submission-card"><header><div><h2>' + escape(project.name || 'Untitled project') + '</h2>' +
        '<span class="submission-meta">' + escape(row.owner_email) + ' · ' + escape(team.name || 'No team') + '</span></div>' +
        '<span class="submission-badge ' + (row.status === 'ready' ? 'ready' : '') + '">' + escape(row.status) + '</span></header>' +
        (tracks.length ? '<div class="submission-tracks">' + tracks.map(function (track) { return '<span>' + escape(track) + '</span>'; }).join('') + '</div>' : '') +
        (memberNames ? '<div class="submission-meta"><strong>Team members</strong><br>' + memberNames + '</div>' : '') +
        '<div class="submission-meta">' + escape(members.length + 1) + ' team member(s) · Updated ' + escape(new Date(row.updated_at).toLocaleString()) + '</div>' +
        (fields ? '<div class="submission-fields">' + fields + '</div>' : '<p>No project details yet.</p>') +
        (links ? '<div class="submission-links">' + links + '</div>' : '') + '</article>';
    }).join('');
  }
  function peopleChoiceMessage(text, isError) {
    $('people-choice-message').textContent = text || '';
    $('people-choice-message').classList.toggle('error', !!isError);
  }
  function renderFinalistOptions() {
    var rows = allRows.filter(function (row) { return row.status === 'ready'; });
    $('people-choice-options').innerHTML = rows.length ? rows.map(function (row) {
      var project = row.project || {}, team = row.team || {};
      var trackText = Array.isArray(project.tracks) ? project.tracks.join(' · ') : '';
      var checked = finalistIds.indexOf(row.id) !== -1;
      return '<label class="finalist-option"><input type="checkbox" data-finalist-selection value="' + escape(row.id) + '"' +
        (checked ? ' checked' : '') + (votingOpen || voteCount > 0 ? ' disabled' : '') + '><span>' +
        escape(project.name || 'Untitled project') + '<small>' + escape(team.name || 'No team') +
        (trackText ? ' · ' + escape(trackText) : '') + '</small></span></label>';
    }).join('') : '<p class="helper">No ready submissions are available to select yet.</p>';
    var selected = document.querySelectorAll('[data-finalist-selection]:checked').length;
    $('people-choice-save-finalists').disabled = votingOpen || voteCount > 0 || selected < 2 || selected > 8;
    $('people-choice-open').hidden = votingOpen;
    $('people-choice-close').hidden = !votingOpen;
    $('people-choice-open').disabled = finalistIds.length < 2 || finalistIds.length > 8;
    $('people-choice-results-button').hidden = votingOpen || voteCount === 0;
  }
  async function refreshPeopleChoice() {
    var statusResult = await client.rpc('get_people_choice_admin_status', {p_event_id:'common-ground-2026-10-11'});
    if (statusResult.error) throw statusResult.error;
    var status = Array.isArray(statusResult.data) ? statusResult.data[0] : statusResult.data;
    var idsResult = await client.rpc('get_people_choice_admin_finalist_ids', {p_event_id:'common-ground-2026-10-11'});
    if (idsResult.error) throw idsResult.error;
    finalistIds = (idsResult.data || []).map(function (row) { return row.submission_id; });
    votingOpen = !!(status && status.voting_open);
    voteCount = Number(status && status.vote_count || 0);
    renderFinalistOptions();
    peopleChoiceMessage(votingOpen
      ? 'Voting is open · ' + finalistIds.length + ' finalists · ' + voteCount + ' ballots cast. Close the poll before viewing the tally.'
      : finalistIds.length + ' finalists selected · ' + voteCount + ' ballots cast. ' +
        (voteCount ? 'The finalist list is locked because voting has started.' : 'Select 2–8 ready submissions, then open voting when you are ready.'));
  }
  $('people-choice-options').addEventListener('change', renderFinalistOptions);
  $('people-choice-save-finalists').addEventListener('click', async function () {
    var ids = Array.prototype.map.call(document.querySelectorAll('[data-finalist-selection]:checked'), function (input) { return input.value; });
    if (ids.length < 2 || ids.length > 8) {
      peopleChoiceMessage('Select between 2 and 8 finalists.', true);
      return;
    }
    this.disabled = true;
    try {
      var result = await client.rpc('set_people_choice_finalists', {
        p_submission_ids: ids,
        p_event_id: 'common-ground-2026-10-11'
      });
      if (result.error) throw result.error;
      $('people-choice-results').hidden = true;
      await refreshPeopleChoice();
      peopleChoiceMessage(ids.length + ' finalists saved. Open voting when you are ready.');
    } catch (error) {
      peopleChoiceMessage(error && error.message ? error.message : 'Could not save finalists.', true);
    } finally { renderFinalistOptions(); }
  });
  async function setVoting(open) {
    try {
      var result = await client.rpc('set_people_choice_voting', {
        p_open: open,
        p_event_id: 'common-ground-2026-10-11'
      });
      if (result.error) throw result.error;
      $('people-choice-results').hidden = true;
      await refreshPeopleChoice();
    } catch (error) {
      peopleChoiceMessage(error && error.message ? error.message : 'Could not update voting.', true);
    }
  }
  $('people-choice-open').addEventListener('click', function () { setVoting(true); });
  $('people-choice-close').addEventListener('click', function () { setVoting(false); });
  $('people-choice-results-button').addEventListener('click', async function () {
    try {
      var result = await client.rpc('get_people_choice_results', {p_event_id:'common-ground-2026-10-11'});
      if (result.error) throw result.error;
      var rows = result.data || [];
      $('people-choice-results').innerHTML = '<h3>People’s Choice tally</h3>' +
        (rows.length ? '<ol>' + rows.map(function (row) {
          return '<li>' + escape(row.project_name) + ' · ' + escape(row.team_name) + ' — <strong>' + escape(row.vote_count) + '</strong></li>';
        }).join('') + '</ol>' : '<p>No finalists or votes to show.</p>');
      $('people-choice-results').hidden = false;
    } catch (error) {
      peopleChoiceMessage(error && error.message ? error.message : 'Could not load results.', true);
    }
  });

  async function loadInbox() {
    if (!client) { message('Supabase is not configured on this site.', true); return; }
    message('Loading submissions…');
    var result = await client.from('submissions')
      .select('id,event_id,owner_email,status,project,team,created_at,updated_at')
      .eq('event_id', 'common-ground-2026-10-11')
      .order('updated_at', { ascending: false });
    if (result.error) throw result.error;
    allRows = result.data || [];
    $('inbox-list').hidden = false;
    render();
    await refreshPeopleChoice();
    message('Loaded the latest submissions and People’s Choice controls.');
  }
  async function handleSession(session) {
    var user = session && session.user;
    $('inbox-login').hidden = !!user;
    $('inbox-signout').hidden = !user;
    if (!user) {
      $('inbox-list').hidden = true;
      message(client ? 'Only emails listed in the Supabase organisers table can see submissions.' : 'Supabase is not configured on this site.', !client);
      return;
    }
    try {
      var result = await client.rpc('is_current_user_organizer');
      if (result.error) throw result.error;
      if (result.data !== true) {
        $('inbox-list').hidden = true;
        message('This account is not authorised as an organiser.', true);
        return;
      }
      await loadInbox();
    } catch (_err) {
      $('inbox-list').hidden = true;
      message('Could not verify organiser access. Check the Supabase setup and reload.', true);
    }
  }
  $('inbox-login').addEventListener('submit', async function (event) {
    event.preventDefault();
    var email = $('inbox-email').value.trim().toLowerCase();
    try {
      await window.CGSubmission.signIn(email);
      message('Check your email for a one-time sign-in link, then return here.');
    } catch (_err) { message('Could not send the sign-in link. Check the email and try again.', true); }
  });
  $('inbox-signout').addEventListener('click', async function () {
    try { await window.CGSubmission.signOut(); }
    catch (_err) { message('Could not sign out. Reload and try again.', true); }
  });
  $('inbox-refresh').addEventListener('click', function () { loadInbox().catch(function () { message('Could not refresh submissions.', true); }); });
  $('inbox-filter').addEventListener('change', render);
  $('inbox-export').addEventListener('click', function () {
    var blob = new Blob([JSON.stringify(allRows, null, 2)], {type:'application/json'});
    var url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = 'common-ground-submissions.json'; link.click();
    URL.revokeObjectURL(url);
  });
  document.addEventListener('cg-submission-auth', function (event) { handleSession(event.detail && event.detail.session); });
  if (!client) { handleSession(null); return; }
  window.CGSubmission.ready.then(handleSession).catch(function () { message('Supabase could not start. Reload and try again.', true); });
})();
