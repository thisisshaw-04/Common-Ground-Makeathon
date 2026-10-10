/* Organiser-only submission inbox. Access is enforced by Supabase RLS. */
(function () {
  'use strict';
  var client = window.CGSubmission && window.CGSubmission.client;
  var allRows = [];
  var allScores = [];
  var currentJudgeId = '';
  var scoringReady = true;
  var finalistIds = [];
  var votingOpen = false;
  var voteCount = 0;
  var votingStatusTimer = null;
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
        (links ? '<div class="submission-links">' + links + '</div>' : '') +
        (row.status === 'ready' ? renderJudgeScore(row) : '') + '</article>';
    }).join('');
  }
  var scoreCriteria = [
    ['concept', 'Concept'],
    ['track_fit', 'Track fit'],
    ['execution', 'Execution'],
    ['presentation', 'Presentation']
  ];
  function judgeScoreRows(submissionId) {
    return allScores.filter(function (score) { return score.submission_id === submissionId; });
  }
  function averageScore(submissionId) {
    var rows = judgeScoreRows(submissionId);
    if (!rows.length) return null;
    var total = rows.reduce(function (sum, score) {
      return sum + Number(score.concept) + Number(score.track_fit) +
        Number(score.execution) + Number(score.presentation);
    }, 0);
    return total / rows.length;
  }
  function scoreField(submissionId, field, label, ownScore) {
    var value = ownScore ? String(ownScore[field]) : '';
    var options = '<option value="">Choose 1–5</option>' + [1,2,3,4,5].map(function (number) {
      return '<option value="' + number + '"' + (value === String(number) ? ' selected' : '') + '>' + number + '</option>';
    }).join('');
    return '<label class="field"><span>' + escape(label) + '</span><select data-score-criterion="' + escape(field) + '">' + options + '</select></label>';
  }
  function renderJudgeScore(row) {
    var ownScore = allScores.find(function (score) {
      return score.submission_id === row.id && score.judge_id === currentJudgeId;
    });
    var total = averageScore(row.id);
    var summary = total == null ? 'No scores yet' :
      'Average ' + total.toFixed(1) + ' / 20 across ' + judgeScoreRows(row.id).length +
      (judgeScoreRows(row.id).length === 1 ? ' judge' : ' judges');
    if (!scoringReady) {
      return '<section class="judge-score-block"><h3>Judge rubric</h3><p class="helper">Run the gallery and judging migration in Supabase to enable scoring.</p></section>';
    }
    return '<section class="judge-score-block" data-submission-id="' + escape(row.id) + '">' +
      '<h3>Judge rubric <span class="judge-score-summary">' + escape(summary) + '</span></h3>' +
      '<div class="judge-score-grid">' + scoreCriteria.map(function (criterion) {
        return scoreField(row.id, criterion[0], criterion[1] + ' · 25%', ownScore);
      }).join('') + '</div>' +
      '<label class="field"><span>PRIVATE ORGANISER NOTES</span><textarea data-score-notes maxlength="2000">' +
      escape(ownScore && ownScore.notes || '') + '</textarea></label>' +
      '<div class="judge-score-actions"><button class="btn btn-sm" data-score-save type="button">Save my scores</button>' +
      '<span class="helper">Scores are 1–5 each; all four criteria count equally.</span></div></section>';
  }
  function setJudgingMessage(text, isError) {
    $('judging-message').textContent = text || '';
    $('judging-message').classList.toggle('error', !!isError);
  }
  async function loadJudgeScores() {
    var result = await client.from('submission_scores')
      .select('submission_id,judge_id,concept,track_fit,execution,presentation,notes,updated_at');
    if (result.error) {
      scoringReady = false;
      allScores = [];
      setJudgingMessage('Judging scores are not set up yet. Apply supabase/migrations/20261011000300_gallery_judging.sql first.', true);
      return;
    }
    scoringReady = true;
    allScores = result.data || [];
    setJudgingMessage('Score each ready project. Your notes stay in the organiser inbox.');
  }
  async function saveJudgeScore(button) {
    var block = button.closest('.judge-score-block');
    var submissionId = block && block.getAttribute('data-submission-id');
    if (!submissionId || !currentJudgeId) return;
    var values = {};
    var complete = true;
    block.querySelectorAll('[data-score-criterion]').forEach(function (select) {
      if (!select.value) complete = false;
      values[select.getAttribute('data-score-criterion')] = Number(select.value);
    });
    if (!complete) {
      setJudgingMessage('Choose a score from 1–5 for all four criteria before saving.', true);
      return;
    }
    button.disabled = true;
    try {
      var record = {
        submission_id: submissionId,
        judge_id: currentJudgeId,
        concept: values.concept,
        track_fit: values.track_fit,
        execution: values.execution,
        presentation: values.presentation,
        notes: block.querySelector('[data-score-notes]').value.trim(),
        updated_at: new Date().toISOString()
      };
      var result = await client.from('submission_scores').upsert(record, {onConflict:'submission_id,judge_id'});
      if (result.error) throw result.error;
      allScores = allScores.filter(function (score) {
        return !(score.submission_id === submissionId && score.judge_id === currentJudgeId);
      });
      allScores.push(record);
      setJudgingMessage('Your scores are saved. ' + (averageScore(submissionId).toFixed(1)) + ' / 20 average across all judges.');
      render();
    } catch (error) {
      setJudgingMessage(error && error.message ? error.message : 'Could not save your scores.', true);
    } finally { button.disabled = false; }
  }
  function autoSelectShortlist() {
    if (!scoringReady) {
      $('judging-shortlist-results').textContent = 'The score-based shortlist is not available until the judging migration is applied.';
      return;
    }
    var selected = [];
    ['Design × Tech', 'Culture × Tech'].forEach(function (track) {
      var ranked = allRows.filter(function (row) {
        return row.status === 'ready' && Array.isArray(row.project && row.project.tracks) &&
          row.project.tracks.indexOf(track) !== -1;
      }).map(function (row) {
        return {row:row, score:averageScore(row.id)};
      }).filter(function (item) { return item.score !== null; });
      ranked.sort(function (a, b) {
        return b.score - a.score ||
          String(a.row.project.name || '').localeCompare(String(b.row.project.name || ''));
      });
      ranked.slice(0, 4).forEach(function (item) {
        if (!selected.some(function (entry) { return entry.row.id === item.row.id; })) {
          selected.push({row:item.row, score:item.score});
        }
      });
    });
    var target = $('judging-shortlist-results');
    if (!selected.length) {
      target.textContent = 'No ready projects have complete judge scores yet.';
      return;
    }
    target.innerHTML = '<h3>Top scoring projects by judged track</h3><ol>' +
      selected.map(function (item) {
        var project = item.row.project || {}, team = item.row.team || {};
        return '<li>' + escape(project.name || 'Untitled project') + ' · ' +
          escape(team.name || 'No team') + ' — ' + item.score.toFixed(1) + ' / 20</li>';
      }).join('') + '</ol><p class="helper">This judging shortlist is separate from People’s Choice voting.</p>';
  }

  function peopleChoiceMessage(text, isError) {
    $('people-choice-message').textContent = text || '';
    $('people-choice-message').classList.toggle('error', !!isError);
  }

  async function refreshPeopleChoice() {
    var statusResult = await client.rpc('get_people_choice_admin_status', {p_event_id:'common-ground-2026-10-11'});
    if (statusResult.error) throw statusResult.error;
    var status = Array.isArray(statusResult.data) ? statusResult.data[0] : statusResult.data || {};
    votingOpen = !!status.voting_open;
    voteCount = Number(status.vote_count || 0);
    var readyCount = Number(status.ready_project_count || 0);
    var paused = !!status.voting_paused;
    var now = Date.now();
    var cutoff = Date.parse('2026-10-11T15:15:00+08:00');
    var ends = Date.parse('2026-10-11T17:00:00+08:00');
    if (votingOpen) {
      peopleChoiceMessage('Voting is open · ' + readyCount + ' projects · ' + voteCount + ' votes cast.');
    } else if (paused) {
      peopleChoiceMessage('Voting is paused · ' + readyCount + ' projects · ' + voteCount + ' votes cast.');
    } else if (now < cutoff) {
      peopleChoiceMessage('Voting opens automatically at 3:15 PM SGT after submissions close · ' + readyCount + ' ready projects.');
    } else if (now < ends) {
      peopleChoiceMessage('Voting is closed · ' + readyCount + ' ready projects · ' + voteCount + ' votes cast.');
    } else {
      peopleChoiceMessage('Voting has ended · ' + readyCount + ' projects · ' + voteCount + ' votes cast.');
    }
    $('people-choice-pause').hidden = !votingOpen;
    $('people-choice-resume').hidden = votingOpen || !paused || now >= ends;
    $('people-choice-results-button').hidden = votingOpen;
  }

  $('judging-shortlist').addEventListener('click', autoSelectShortlist);
  $('people-choice-pause').addEventListener('click', async function () {
    this.disabled = true;
    try {
      var result = await client.rpc('set_people_choice_voting', {p_open:false,p_event_id:'common-ground-2026-10-11'});
      if (result.error) throw result.error;
      await refreshPeopleChoice();
    } catch (error) {
      peopleChoiceMessage(error && error.message ? error.message : 'Could not pause voting.', true);
    } finally { this.disabled = false; }
  });
  $('people-choice-resume').addEventListener('click', async function () {
    this.disabled = true;
    try {
      var result = await client.rpc('set_people_choice_voting', {p_open:true,p_event_id:'common-ground-2026-10-11'});
      if (result.error) throw result.error;
      await refreshPeopleChoice();
    } catch (error) {
      peopleChoiceMessage(error && error.message ? error.message : 'Could not resume voting.', true);
    } finally { this.disabled = false; }
  });
  $('people-choice-results-button').addEventListener('click', async function () {
    try {
      var result = await client.rpc('get_people_choice_results', {p_event_id:'common-ground-2026-10-11'});
      if (result.error) throw result.error;
      var rows = result.data || [];
      $('people-choice-results').innerHTML = '<h3>People’s Choice results</h3>' +
        (rows.length ? '<ol>' + rows.map(function (row) {
          return '<li>' + escape(row.project_name) + ' · ' + escape(row.team_name) +
            ' — <strong>' + escape(row.vote_count) + '</strong></li>';
        }).join('') + '</ol>' : '<p>No votes were cast.</p>');
      $('people-choice-results').hidden = false;
    } catch (error) {
      peopleChoiceMessage(error && error.message ? error.message : 'Results are not available yet.', true);
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
    await loadJudgeScores();
    $('inbox-list').hidden = false;
    render();
    await refreshPeopleChoice();
    if (!votingStatusTimer) votingStatusTimer = window.setInterval(function () {
      refreshPeopleChoice().catch(function () { /* Keep the last known status visible. */ });
    }, 15000);
    message('Loaded the latest submissions and voting status.');
  }
  async function handleSession(session) {
    var user = session && session.user;
    currentJudgeId = user && user.id || '';
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
  $('inbox-cards').addEventListener('click', function (event) {
    var button = event.target.closest('[data-score-save]');
    if (button) saveJudgeScore(button);
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
