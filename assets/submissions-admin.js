/* Organiser-only submission review, judge rubric, finalist controls and vote results. */
(function () {
  'use strict';
  var EVENT_ID = 'common-ground-2026-10-11';
  var client = window.CGSubmission && window.CGSubmission.client;
  var rows = [], scores = [], finalistIds = [], adminStatus = null, scoresReady = false;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); };
  function safeHref(value) { try { var url = new URL(value); return /^https?:$/.test(url.protocol) ? esc(url.href) : ''; } catch (_err) { return ''; } }
  function message(text, error) { $('inbox-message').textContent = text; $('inbox-message').classList.toggle('error', !!error); }
  function trackName(value) {
    return ({design_tech:'Design × Tech',culture_tech:'Culture × Tech',best_use_of_tech:'Best Use of Tech',common_ground:'Common Ground Award'})[value] || value;
  }
  function scoreRows(id) { return scores.filter(function (score) { return score.submission_id === id; }); }
  function scoreAverage(id) {
    var list = scoreRows(id);
    if (!list.length) return null;
    var total = 0, count = 0;
    list.forEach(function (score) {
      ['concept','track_fit','execution','presentation'].forEach(function (key) {
        var value = Number(score[key]); if (value >= 1 && value <= 5) { total += value; count++; }
      });
    });
    return count ? total / count : null;
  }
  function renderVotes() {
    var state = adminStatus || {};
    $('vote-status').textContent = state.voting_open ? 'VOTING OPEN' : 'VOTING CLOSED';
    $('vote-count').textContent = String(state.vote_count || 0) + (Number(state.vote_count) === 1 ? ' vote recorded' : ' votes recorded');
    $('vote-toggle').textContent = state.voting_open ? 'Close voting' : 'Open voting';
    $('vote-toggle').disabled = Number(state.finalist_count || 0) < 2 && !state.voting_open;
    $('finalist-count').textContent = String(state.finalist_count || 0) + ' / 8 finalists selected';
  }
  function renderResults(data) {
    var target = $('vote-results');
    if (adminStatus && adminStatus.voting_open) {
      target.innerHTML = '<p class="workflow-help">Vote totals appear here after voting is closed.</p>';
      return;
    }
    target.innerHTML = (data || []).length ? data.map(function (row) {
      return '<div class="judge-result-row"><span>' + esc(row.project_name) + ' · ' + esc(row.team_name) + '</span><strong>' + esc(row.vote_count) + '</strong></div>';
    }).join('') : '<p class="workflow-help">No results are available yet.</p>';
  }
  function render() {
    var filter = $('inbox-filter').value;
    var filtered = rows.filter(function (row) { return !filter || row.status === filter; });
    $('inbox-count').textContent = filtered.length + (filtered.length === 1 ? ' SUBMISSION' : ' SUBMISSIONS');
    if (!filtered.length) { $('inbox-cards').innerHTML = '<p class="helper">No submissions match this filter yet.</p>'; renderVotes(); return; }
    $('inbox-cards').innerHTML = filtered.map(function (row) {
      var project = row.project || {}, team = row.team || {};
      var thisScores = scoreRows(row.id);
      var mine = thisScores.find(function (score) { return score.judge_id === (window.CGSubmission.getUser() || {}).id; }) || {};
      var average = scoreAverage(row.id);
      var tracks = Array.isArray(project.tracks) ? project.tracks.map(trackName).join(' · ') : 'No track selected';
      var links = [
        project.demo ? '<a href="' + safeHref(project.demo) + '" target="_blank" rel="noopener noreferrer">Live demo ↗</a>' : '',
        project.video ? '<a href="' + safeHref(project.video) + '" target="_blank" rel="noopener noreferrer">Demo video ↗</a>' : '',
        project.source ? '<a href="' + safeHref(project.source) + '" target="_blank" rel="noopener noreferrer">Source ↗</a>' : '',
        project.prototype ? '<a href="' + safeHref(project.prototype) + '" target="_blank" rel="noopener noreferrer">Prototype ↗</a>' : ''
      ].filter(Boolean).join('');
      var overview = [
        ['One-liner',project.oneLiner],['Inspiration',project.inspiration],['Solution',project.solution],['What makes it interesting',project.interesting]
      ].filter(function (pair) { return pair[1]; }).map(function (pair) { return '<p><strong>' + esc(pair[0]) + ':</strong> ' + esc(pair[1]) + '</p>'; }).join('');
      var build = [
        ['Technology',project.technology],['What works now',project.currentBuild],['Experiment',project.experiment],['Next',project.nextSteps]
      ].filter(function (pair) { return pair[1]; }).map(function (pair) { return '<p><strong>' + esc(pair[0]) + ':</strong> ' + esc(pair[1]) + '</p>'; }).join('');
      var extras = [
        ['Design × Tech reflection',project.designReflection],['Culture × Tech reflection',project.cultureReflection],
        ['Team collaboration',team.collaboration],['AI/tool attribution',project.aiTools],['External credits',project.thirdParty],['Setup',project.setup]
      ].filter(function (pair) { return pair[1]; }).map(function (pair) { return '<p><strong>' + esc(pair[0]) + ':</strong> ' + esc(pair[1]) + '</p>'; }).join('');
      var members = (Array.isArray(team.members) ? team.members : []).map(function (member) { return typeof member === 'string' ? member : member.name || ''; }).filter(Boolean).join(', ');
      var opts = function (field) { return '<option value="">—</option><option value="1"' + (Number(mine[field])===1?' selected':'') + '>1</option><option value="2"' + (Number(mine[field])===2?' selected':'') + '>2</option><option value="3"' + (Number(mine[field])===3?' selected':'') + '>3</option><option value="4"' + (Number(mine[field])===4?' selected':'') + '>4</option><option value="5"' + (Number(mine[field])===5?' selected':'') + '>5</option>'; };
      var scoreForm = !scoresReady ? '<p class="workflow-help">Apply the judging migration to enable rubric scoring.</p>' : row.status !== 'ready' ? '<p class="workflow-help">Only ready submissions can be scored.</p>' : '<div class="judge-score">Your scoring uses four equally weighted criteria, 1–5 each. Current average across organisers: ' + (average === null ? 'Not scored' : average.toFixed(2) + ' / 5 · ' + (average*4).toFixed(1) + ' / 20') + ' (' + thisScores.length + ' judge(s))</div>' +
        '<div class="judge-fields"><label class="field"><span>CONCEPT</span><select data-score-field="concept" data-submission="' + esc(row.id) + '">' + opts('concept') + '</select></label>' +
        '<label class="field"><span>TRACK FIT</span><select data-score-field="track_fit" data-submission="' + esc(row.id) + '">' + opts('track_fit') + '</select></label>' +
        '<label class="field"><span>EXECUTION</span><select data-score-field="execution" data-submission="' + esc(row.id) + '">' + opts('execution') + '</select></label>' +
        '<label class="field"><span>PRESENTATION</span><select data-score-field="presentation" data-submission="' + esc(row.id) + '">' + opts('presentation') + '</select></label></div>' +
        '<label class="field"><span>JUDGE NOTES (OPTIONAL)</span><textarea data-score-notes="' + esc(row.id) + '">' + esc(mine.notes || '') + '</textarea></label>' +
        '<button class="btn" type="button" data-save-score="' + esc(row.id) + '">Save my rubric</button>';
      return '<article class="judge-card"><header><div><h2>' + esc(project.name || 'Untitled project') + '</h2><p class="submission-meta">' + esc(team.name || 'No team') + ' · ' + esc(row.owner_email) + '</p><p class="submission-meta">' + esc(tracks) + '</p></div><span class="submission-badge ' + (row.status==='ready'?'ready':'') + '">' + esc(row.status) + '</span></header>' +
        '<p><strong>Team members:</strong> ' + esc(members || 'Not listed') + '</p>' +
        '<details open><summary>Project overview</summary>' + overview + '</details><details open><summary>The build</summary>' + build + '</details><details><summary>Track reflection, collaboration and credits</summary>' + extras + '</details>' +
        '<div class="judge-links">' + links + '</div>' +
        '<label class="judge-finalist"><input type="checkbox" data-finalist="' + esc(row.id) + '"' + (finalistIds.indexOf(row.id)!==-1?' checked':'') + (row.status!=='ready'?' disabled':'') + '> Select for People’s Choice shortlist</label>' +
        scoreForm + '</article>';
    }).join('');
    renderVotes();
  }
  async function loadPeopleChoice() {
    var result = await client.rpc('get_people_choice_admin_status', {p_event_id:EVENT_ID});
    if (result.error) throw result.error;
    adminStatus = Array.isArray(result.data) ? result.data[0] : result.data;
    var finalistResult = await client.rpc('get_people_choice_admin_finalist_ids', {p_event_id:EVENT_ID});
    if (finalistResult.error) throw finalistResult.error;
    finalistIds = (finalistResult.data || []).map(function (item) { return item.submission_id; });
    var results = [];
    if (!adminStatus.voting_open) {
      var resultRows = await client.rpc('get_people_choice_results', {p_event_id:EVENT_ID});
      if (!resultRows.error) results = resultRows.data || [];
    }
    renderResults(results);
    $('vote-controls').hidden = false;
  }
  async function loadInbox() {
    if (!client) { message('Supabase is not configured on this site.', true); return; }
    message('Loading submissions and judging tools…');
    var result = await client.from('submissions').select('id,event_id,owner_email,status,project,team,created_at,updated_at')
      .eq('event_id', EVENT_ID).order('updated_at', {ascending:false});
    if (result.error) throw result.error;
    rows = result.data || [];
    var scoreResult = await client.from('submission_scores').select('submission_id,judge_id,concept,track_fit,execution,presentation,notes,updated_at')
      .in('submission_id', rows.map(function (row) { return row.id; }).length ? rows.map(function (row) { return row.id; }) : ['00000000-0000-0000-0000-000000000000']);
    scoresReady = !scoreResult.error;
    scores = scoresReady ? (scoreResult.data || []) : [];
    try { await loadPeopleChoice(); } catch (_error) { $('vote-controls').hidden = false; message('Submissions loaded. People’s Choice controls need the Supabase voting setup.', true); }
    $('inbox-list').hidden = false;
    render();
    if (!scoresReady) message('Submissions loaded. Apply the judging migration in Supabase to enable scoring.', true);
    else message('Loaded submissions and organiser judging tools.');
  }
  async function handleSession(session) {
    var user = session && session.user;
    $('inbox-login').hidden = !!user;
    $('inbox-signout').hidden = !user;
    if (!user) { $('inbox-list').hidden = true; message(client ? 'Only addresses in the Supabase organisers list can open the inbox.' : 'Supabase is not configured.', !client); return; }
    try {
      var check = await client.rpc('is_current_user_organizer');
      if (check.error) throw check.error;
      if (check.data !== true) { $('inbox-list').hidden = true; message('This account is not authorised as an organiser.', true); return; }
      await loadInbox();
    } catch (_error) { $('inbox-list').hidden = true; message('Could not verify organiser access. Refresh and try again.', true); }
  }
  $('inbox-login').addEventListener('submit', async function (event) {
    event.preventDefault();
    try { await window.CGSubmission.signIn($('inbox-email').value.trim().toLowerCase()); message('Check your email for a secure sign-in link.'); }
    catch (_error) { message('Could not send the sign-in link. Check the email and try again.', true); }
  });
  $('inbox-signout').addEventListener('click', async function () { try { await window.CGSubmission.signOut(); } catch (_error) { message('Could not sign out. Reload and try again.', true); } });
  $('inbox-refresh').addEventListener('click', function () { loadInbox().catch(function () { message('Could not refresh the submission inbox.', true); }); });
  $('inbox-filter').addEventListener('change', render);
  $('inbox-cards').addEventListener('change', function (event) {
    var control = event.target.closest('[data-finalist]');
    if (!control) return;
    var id = control.getAttribute('data-finalist');
    if (control.checked && finalistIds.indexOf(id) === -1) finalistIds.push(id);
    if (!control.checked) finalistIds = finalistIds.filter(function (item) { return item !== id; });
    if (finalistIds.length > 8) { finalistIds.pop(); control.checked = false; message('Choose no more than 8 finalists.', true); }
    $('finalist-count').textContent = finalistIds.length + ' / 8 finalists selected — save to publish the shortlist';
  });
  $('inbox-cards').addEventListener('click', async function (event) {
    var button = event.target.closest('[data-save-score]');
    if (!button || !scoresReady) return;
    var id = button.getAttribute('data-save-score'), user = window.CGSubmission.getUser();
    var payload = {submission_id:id,judge_id:user.id,updated_at:new Date().toISOString()};
    var valid = true;
    ['concept','track_fit','execution','presentation'].forEach(function (key) {
      var value = Number($('[data-score-field="' + key + '"][data-submission="' + id + '"]').value);
      if (value < 1 || value > 5) valid = false;
      payload[key] = value;
    });
    payload.notes = $('[data-score-notes="' + id + '"]').value.trim();
    if (!valid) { message('Choose a score from 1 to 5 for all four criteria before saving.', true); return; }
    button.disabled = true;
    var result = await client.from('submission_scores').upsert(payload, {onConflict:'submission_id,judge_id'});
    button.disabled = false;
    if (result.error) { message('Could not save this rubric. Check the Supabase judging migration.', true); return; }
    var prior = scores.findIndex(function (score) { return score.submission_id === id && score.judge_id === user.id; });
    if (prior >= 0) scores[prior] = payload; else scores.push(payload);
    render(); message('Rubric saved. Scores are averaged equally across all four criteria.', false);
  });
  $('save-finalists').addEventListener('click', async function () {
    if (finalistIds.length < 2 || finalistIds.length > 8) { message('Select between 2 and 8 ready projects for the shortlist.', true); return; }
    var result = await client.rpc('set_people_choice_finalists', {p_submission_ids:finalistIds,p_event_id:EVENT_ID});
    if (result.error) { message('Could not save finalists. Close voting first; the shortlist locks after the first vote.', true); return; }
    await loadPeopleChoice(); render(); message('Finalist shortlist saved and visible to eligible attendees.');
  });
  $('auto-finalists').addEventListener('click', function () {
    var selected = [];
    ['design_tech','culture_tech'].forEach(function (track) {
      rows.filter(function (row) { return row.status==='ready' && Array.isArray(row.project.tracks) && row.project.tracks.indexOf(track)!==-1; })
        .sort(function (a,b) {
          var sa=scoreAverage(a.id), sb=scoreAverage(b.id);
          if (sa===null) sa=-1; if (sb===null) sb=-1;
          return sb-sa || String(a.project.name||'').localeCompare(String(b.project.name||''));
        }).slice(0,4).forEach(function (row) { if (selected.indexOf(row.id)===-1) selected.push(row.id); });
    });
    if (selected.length > 8) selected=selected.slice(0,8);
    finalistIds=selected; render();
    $('finalist-count').textContent=selected.length+' / 8 finalists selected — save to publish the shortlist';
    message('Selected the four highest rubric averages per primary track, removing duplicates. Check the list before saving.');
  });
  $('vote-toggle').addEventListener('click', async function () {
    var result = await client.rpc('set_people_choice_voting', {p_open:!adminStatus.voting_open,p_event_id:EVENT_ID});
    if (result.error) { message('Could not change the voting state. Publish at least two finalists first.', true); return; }
    await loadPeopleChoice(); render();
    message(adminStatus.voting_open?'People’s Choice voting is now open.':'Voting is closed; results are available below.');
  });
  $('inbox-export').addEventListener('click', function () {
    var blob=new Blob([JSON.stringify(rows,null,2)],{type:'application/json'}), url=URL.createObjectURL(blob), link=document.createElement('a');
    link.href=url; link.download='common-ground-submissions.json'; link.click(); URL.revokeObjectURL(url);
  });
  document.addEventListener('cg-submission-auth', function (event) { handleSession(event.detail && event.detail.session); });
  if (!client) { handleSession(null); return; }
  window.CGSubmission.ready.then(handleSession).catch(function () { message('Supabase could not start. Reload and try again.', true); });
})();