/* Organiser-only submission inbox. Access is enforced by Supabase RLS. */
(function () {
  'use strict';
  var client = window.CGSubmission && window.CGSubmission.client;
  var allRows = [];
  var xlsxPromise = null;
  var votingOpen = false;
  var voteCount = 0;
  var votingStatusTimer = null;
  var claimRefreshTimer = null;
  var submissionRefreshTimer = null;
  var $ = function (id) { return document.getElementById(id); };
  var escape = function (value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); };
  function safeHref(value) { try { var url = new URL(value); return /^https?:$/.test(url.protocol) ? escape(url.href) : ''; } catch (_err) { return ''; } }
  function message(text, error) {
    $('inbox-message').textContent = text;
    $('inbox-message').classList.toggle('error', !!error);
  }
  var claimToolLabels = {openai:'OpenAI',figma:'Figma Make',mobbin:'Mobbin Pro'};
  function toolClaimsMessage(text, isError) {
    $('tool-claims-message').textContent = text || '';
    $('tool-claims-message').classList.toggle('error', !!isError);
  }
  async function loadToolClaims() {
    try {
      var result = await client.rpc('get_tool_code_claims_admin');
      if (result.error) throw result.error;
      var summary = Object.create(null);
      var claims = [];
      (result.data || []).forEach(function (row) {
        if (!claimToolLabels[row.tool]) return;
        if (!summary[row.tool]) summary[row.tool] = {
          total:Number(row.total_codes) || 0,
          claimed:Number(row.claimed_count) || 0,
          remaining:Number(row.remaining_count) || 0
        };
        if (row.claimant_email) claims.push(row);
      });
      var toolOrder = ['openai','figma','mobbin'];
      $('tool-claims-summary').innerHTML = toolOrder.map(function (tool) {
        var counts = summary[tool] || {total:0,claimed:0,remaining:0};
        return '<div class="tool-claim-stat"><span class="eyebrow">' + escape(claimToolLabels[tool]) +
          '</span><strong>' + escape(counts.claimed) + ' / ' + escape(counts.total) + ' claimed</strong>' +
          '<small>' + escape(counts.remaining) + ' remaining</small></div>';
      }).join('');
      $('tool-claims-rows').innerHTML = claims.length ? claims.map(function (row) {
        var timestamp = row.claimed_at ? new Date(row.claimed_at).toLocaleString() : '—';
        return '<tr><td>' + escape(claimToolLabels[row.tool]) + '</td><td>' +
          escape(row.claimant_email) + '</td><td>' + escape(timestamp) + '</td></tr>';
      }).join('') : '<tr><td colspan="3">No promo codes have been claimed yet.</td></tr>';
      toolClaimsMessage('Updated just now. This list refreshes automatically every 30 seconds.');
    } catch (_error) {
      $('tool-claims-summary').innerHTML = '';
      $('tool-claims-rows').innerHTML = '<tr><td colspan="3">Could not load claim records.</td></tr>';
      toolClaimsMessage('Could not load claims. Check the database setup and try again.', true);
    }
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
        '</article>';
    }).join('');
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

  $('tool-claims-refresh').addEventListener('click', async function () {
    this.disabled = true;
    await loadToolClaims();
    this.disabled = false;
  });
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

  async function refreshSubmissionRows() {
    var result = await client.from('submissions')
      .select('id,event_id,owner_email,status,project,team,created_at,updated_at')
      .eq('event_id', 'common-ground-2026-10-11')
      .order('updated_at', { ascending: false });
    if (result.error) throw result.error;
    allRows = result.data || [];
  }
  async function loadInbox() {
    if (!client) { message('Supabase is not configured on this site.', true); return; }
    message('Loading submissions…');
    await refreshSubmissionRows();
    $('inbox-list').hidden = false;
    render();
    await refreshPeopleChoice();
    await loadToolClaims();
    if (!claimRefreshTimer) claimRefreshTimer = window.setInterval(function () {
      loadToolClaims();
    }, 30000);
    if (!votingStatusTimer) votingStatusTimer = window.setInterval(function () {
      refreshPeopleChoice().catch(function () { /* Keep the last known status visible. */ });
    }, 15000);
    if (!submissionRefreshTimer) submissionRefreshTimer = window.setInterval(function () {
      if (document.hidden || $('inbox-cards').contains(document.activeElement)) return;
      refreshSubmissionRows().then(render).catch(function () { /* Keep the last loaded organiser view visible. */ });
    }, 15000);
    message('Loaded the latest submissions and voting status.');
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
      message('Check your inbox and spam folder. Open the newest link in this browser to view the inbox.');
    } catch (_err) { message(window.CGSubmission.signInErrorMessage(_err), true); }
  });
  $('inbox-signout').addEventListener('click', async function () {
    try { await window.CGSubmission.signOut(); }
    catch (_err) { message('Could not sign out. Reload and try again.', true); }
  });
  $('inbox-refresh').addEventListener('click', function () { loadInbox().catch(function () { message('Could not refresh submissions.', true); }); });
  $('inbox-filter').addEventListener('change', render);
  function loadSpreadsheetLibrary() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (xlsxPromise) return xlsxPromise;
    xlsxPromise = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
      script.async = true;
      script.onload = function () {
        if (window.XLSX) resolve(window.XLSX);
        else reject(new Error('Excel library did not load.'));
      };
      script.onerror = function () { reject(new Error('Excel library could not load.')); };
      document.head.appendChild(script);
    });
    return xlsxPromise;
  }
  function buildJudgingWorkbook(XLSX) {
    var core = [
      ['Team name', function (row) { return row.team && row.team.name || ''; }],
      ['Project name', function (row) { return row.project && row.project.name || ''; }],
      ['Project description', function (row) {
        var project = row.project || {};
        return [
          project.oneLiner,
          project.inspiration ? 'Problem / inspiration: ' + project.inspiration : '',
          project.solution ? 'Solution: ' + project.solution : '',
          project.interesting ? 'What makes it interesting: ' + project.interesting : ''
        ].filter(Boolean).join('\\n\\n');
      }],
      ['Live demo / site', function (row) { return row.project && row.project.demo || ''; }],
      ['GitHub / source code', function (row) { return row.project && row.project.source || ''; }],
      ['Demo video', function (row) { return row.project && row.project.video || ''; }],
      ['Figma / prototype', function (row) { return row.project && row.project.prototype || ''; }],
      ['Other supporting materials', function (row) { return row.project && row.project.supporting || ''; }],
      ['Tracks', function (row) { return Array.isArray(row.project && row.project.tracks) ? row.project.tracks.join(', ') : ''; }],
      ['Team members', function (row) {
        var team = row.team || {}, members = [];
        if (team.contact && team.contact.name) members.push(team.contact.name);
        (Array.isArray(team.members) ? team.members : []).forEach(function (member) {
          if (member && member.name && !members.some(function (name) { return name.toLowerCase() === String(member.name).toLowerCase(); })) {
            members.push(member.name);
          }
        });
        return members.join(', ');
      }],
      ['Technology used', function (row) { return row.project && row.project.technology || ''; }],
      ['What works now', function (row) { return row.project && row.project.made || ''; }],
      ['Experiments / learning', function (row) { return row.project && row.project.experiment || ''; }],
      ['What they would do next', function (row) { return row.project && row.project.next || ''; }],
      ['Design × Tech reflection', function (row) { return row.project && row.project.designReflection || ''; }],
      ['Culture × Tech reflection', function (row) { return row.project && row.project.cultureReflection || ''; }],
      ['Team & collaboration', function (row) { return row.project && row.project.collaboration || ''; }],
      ['AI & tool attribution', function (row) { return row.project && row.project.attribution || ''; }],
      ['Submission status', function (row) { return row.status || ''; }],
      ['Last updated', function (row) { return row.updated_at || ''; }]
    ];
    var scoreHeaders = ['Judge', 'Concept', 'Track fit', 'Execution', 'Presentation', 'Final marks / 20'];
    var header = core.map(function (column) { return column[0]; }).concat(scoreHeaders);
    var dataRows = [header];
    var readyRows = allRows.filter(function (row) { return row.status === 'ready'; });
    readyRows.forEach(function (row) {
      var projectData = core.map(function (column) {
        var value = column[1](row);
        return value == null ? '' : value;
      });
      [1, 2, 3].forEach(function (judgeNumber) {
        dataRows.push(projectData.concat(['Judge ' + judgeNumber, '', '', '', '', '']));
      });
    });
    var sheet = XLSX.utils.aoa_to_sheet(dataRows);
    var criterionStart = core.length + 1;
    dataRows.slice(1).forEach(function (_values, index) {
      var rowIndex = index + 1;
      var firstCriterion = XLSX.utils.encode_cell({r:rowIndex,c:criterionStart});
      var lastCriterion = XLSX.utils.encode_cell({r:rowIndex,c:criterionStart + 3});
      var totalCell = XLSX.utils.encode_cell({r:rowIndex,c:core.length + 5});
      sheet[totalCell] = {
        t:'n',
        f:'IF(COUNT(' + firstCriterion + ':' + lastCriterion + ')=4,SUM(' + firstCriterion + ':' + lastCriterion + '),"")'
      };
    });
    sheet['!autofilter'] = {ref:XLSX.utils.encode_range({
      s:{r:0,c:0},e:{r:Math.max(0,dataRows.length - 1),c:core.length + 5}
    })};
    var widths = [20,26,58,34,34,30,30,38,28,38,32,32,32,32,34,34,34,34,18,22];
    sheet['!cols'] = core.map(function (_column, index) { return {wch:widths[index] || 26}; })
      .concat([{wch:14},{wch:13},{wch:13},{wch:13},{wch:15},{wch:18}]);
    sheet['!rows'] = [{hpt:32}];
    dataRows.slice(1).forEach(function (values) {
      var maxLines = 1;
      values.forEach(function (value) {
        var text = String(value == null ? '' : value);
        var lines = text.split('\\n').reduce(function (sum, line) {
          return sum + Math.max(1, Math.ceil(line.length / 58));
        }, 0);
        maxLines = Math.max(maxLines, lines);
      });
      sheet['!rows'].push({hpt:Math.min(240,Math.max(30,maxLines * 15))});
    });

    var guide = XLSX.utils.aoa_to_sheet([
      ['COMMON GROUND — SCORING GUIDE'],
      ['Score', 'Meaning'],
      [1, 'Weak'],
      [2, 'Below Expectations'],
      [3, 'Meets Expectations'],
      [4, 'Strong'],
      [5, 'Exceptional'],
      [],
      ['Criteria', 'Concept · Track fit · Execution · Presentation'],
      ['Scoring', 'Enter one score from 1–5 for each criterion in the Judging Sheet.'],
      ['Per judge', 'Maximum 20 marks across four criteria.'],
      ['Project total', 'Three judges; maximum 60 marks.']
    ]);
    guide['!cols'] = [{wch:24},{wch:76}];
    var workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Judging Sheet');
    XLSX.utils.book_append_sheet(workbook, guide, 'Scoring Guide');
    workbook.Props = {
      Title:'Common Ground Makeathon judging sheet',
      Subject:'Project submissions and offline judge scoring',
      Author:'Common Ground Makeathon'
    };
    if (workbook.Workbook) workbook.Workbook.CalcPr = {fullCalcOnLoad:true,forceFullCalc:true};
    return workbook;
  }
  async function exportSpreadsheet(button) {
    if (button.disabled) return;
    button.disabled = true;
    message('Preparing the Excel judging sheet…');
    try {
      var XLSX = await loadSpreadsheetLibrary();
      var workbook = buildJudgingWorkbook(XLSX);
      XLSX.writeFile(workbook, 'common-ground-judging-sheet-2026-10-11.xlsx', {compression:true});
      message('Excel judging sheet downloaded.');
    } catch (_error) {
      message('Could not prepare the Excel file. Check your connection and try again.', true);
    } finally { button.disabled = false; }
  }
  $('inbox-export').addEventListener('click', function () { exportSpreadsheet(this); });
  document.addEventListener('cg-submission-auth', function (event) { handleSession(event.detail && event.detail.session); });
  if (!client) { handleSession(null); return; }
  window.CGSubmission.ready.then(handleSession).catch(function () { message('Supabase could not start. Reload and try again.', true); });
})();
