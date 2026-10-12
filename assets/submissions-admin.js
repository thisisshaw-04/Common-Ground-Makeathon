/* Organiser-only submission inbox. Access is enforced by Supabase RLS. */
(function () {
  'use strict';
  var client = window.CGSubmission && window.CGSubmission.client;
  var allRows = [];
  var xlsxPromise = null;
  var votingOpen = false;
  var submissionsOpen = false;
  var voteCount = 0;
  var votingStatusTimer = null;
  var claimRefreshTimer = null;
  var submissionRefreshTimer = null;
  var submissionAccessTimer = null;
  var $ = function (id) { return document.getElementById(id); };
  var escape = function (value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); };
  function safeHref(value) { try { var url = new URL(value); return /^https?:$/.test(url.protocol) ? escape(url.href) : ''; } catch (_err) { return ''; } }
  function youtubeThumbnail(value) {
    try {
      var url = new URL(value);
      var host = url.hostname.toLowerCase().replace(/^www\./, '');
      var id = '';
      if (host === 'youtu.be') id = url.pathname.split('/').filter(Boolean)[0] || '';
      else if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
        id = url.searchParams.get('v') || '';
        if (!id) id = (url.pathname.match(/\/(?:embed|shorts|live)\/([\w-]{6,})/) || [])[1] || '';
      }
      return /^[\w-]{6,}$/.test(id) ? 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg' : '';
    } catch (_err) { return ''; }
  }
  function previewImage(project) {
    var image = safeHref(project.preview_image_url || project.preview_image || project.previewImage);
    if (image) return image;
    var candidates = [project.demo, project.video];
    for (var i = 0; i < candidates.length; i++) {
      var candidate = safeHref(candidates[i]);
      if (candidate && /\.(?:png|jpe?g|gif|webp|avif)(?:$|[?#])/i.test(candidate)) return candidate;
    }
    return youtubeThumbnail(project.video || '');
  }
  function previewMarkup(project, name) {
    var image = previewImage(project);
    var oneLiner = project.oneLiner || '';
    return '<div class="submission-preview' + (image ? ' has-image' : '') + '">' +
      (image ? '<img src="' + image + '" alt="' + escape(name) + ' project preview" loading="lazy" referrerpolicy="no-referrer">' : '') +
      '<span class="preview-kicker">COMMON GROUND / PROJECT</span>' +
      (!image ? '<strong>' + escape(name) + '</strong>' : '') +
      '<span class="preview-caption">' + escape(image ? 'A look inside the project' : (oneLiner || 'Open the project details to see what the team made.')) + '</span>' +
      '</div>';
  }
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
      var name = project.name || 'Untitled project';
      var members = Array.isArray(team.members) ? team.members : [];
      var linkItems = [
        ['Live demo', project.demo], ['Demo video', project.video], ['Source code', project.source],
        ['Figma / prototype', project.prototype]
      ];
      var links = linkItems.map(function (item) {
        var href = item[1] && safeHref(item[1]);
        return href ? '<a href="' + href + '" target="_blank" rel="noopener noreferrer">' + escape(item[0]) + ' ↗</a>' : '';
      }).filter(Boolean).join('');
      if (project.supporting) {
        links += (links ? ' ' : '') + '<span>' + escape(project.supporting) + '</span>';
      }
      var labels = {
        overview:'Project overview', build:'The build',
        oneLiner:'One-liner', inspiration:'Problem / inspiration', solution:'Solution', interesting:'What makes it interesting?',
        technology:'Technology used', made:'What works now', experiment:'Experiment / learning', next:'What they would do next',
        designReflection:'Design × Tech reflection', cultureReflection:'Culture × Tech reflection',
        collaboration:'Team & collaboration', attribution:'AI & tool attribution'
      };
      var hasCombinedAnswers = Object.prototype.hasOwnProperty.call(project, 'overview') || Object.prototype.hasOwnProperty.call(project, 'build');
      var fieldOrder = hasCombinedAnswers
        ? ['overview','build','designReflection','cultureReflection','collaboration','attribution']
        : ['oneLiner','inspiration','solution','interesting','technology','made','experiment','next','designReflection','cultureReflection','collaboration','attribution'];
      var fields = fieldOrder.filter(function (key) { return project[key]; }).map(function (key) {
        return '<section class="submission-detail"><strong>' + escape(labels[key]) + '</strong><p>' + escape(project[key]) + '</p></section>';
      }).join('');
      var tracks = Array.isArray(project.tracks) ? project.tracks : [];
      var memberNames = members.map(function (member) {
        return escape(member.name || '') + (member.email ? ' · ' + escape(member.email) : '');
      }).filter(Boolean).join('<br>');
      var expanded = (tracks.length ? '<div class="submission-tracks">' + tracks.map(function (track) { return '<span>' + escape(track) + '</span>'; }).join('') + '</div>' : '') +
        (memberNames ? '<div class="submission-meta"><strong>Team members</strong><br>' + memberNames + '</div>' : '') +
        '<div class="submission-meta">' + escape(members.length + 1) + ' team member(s) · Updated ' + escape(new Date(row.updated_at).toLocaleString()) + '</div>' +
        (fields ? '<div class="submission-fields">' + fields + '</div>' : '<p>No project details yet.</p>') +
        (links ? '<div class="submission-links">' + links + '</div>' : '');
      var modalContent = '<div class="project-modal-project">' +
        '<h2>' + escape(name) + '</h2>' +
        '<p class="project-modal-team">' + escape(team.name || 'No team') + '</p>' +
        '<p class="project-modal-status"><span class="submission-badge ' + (row.status === 'ready' ? 'ready' : '') + '">' + escape(row.status) + '</span></p>' +
        '<div class="project-modal-details">' + expanded + '</div>' +
        '</div>';
      return '<article class="submission-card" data-project-modal-card>' +
        '<button class="project-modal-trigger submission-card-trigger" type="button" data-project-modal-open aria-haspopup="dialog">' +
        previewMarkup(project, name) +
        '<div class="submission-card-copy"><header><div><span class="submission-meta">' + escape(team.name || 'No team') +
        '</span><h2>' + escape(name) + '</h2></div><span class="submission-badge ' + (row.status === 'ready' ? 'ready' : '') +
        '">' + escape(row.status) + '</span></header>' +
        (project.oneLiner ? '<p class="submission-one-liner">' + escape(project.oneLiner) + '</p>' : '') +
        '<span class="submission-card-toggle"><span>View project details</span><span aria-hidden="true">↗</span></span>' +
        '</div></button><template data-project-modal-content>' + modalContent + '</template></article>';
    }).join('');
  }
  function peopleChoiceMessage(text, isError) {
    $('people-choice-message').textContent = text || '';
    $('people-choice-message').classList.toggle('error', !!isError);
  }

  function submissionAccessMessage(text, isError) {
    $('submission-access-message').textContent = text || '';
    $('submission-access-message').classList.toggle('error', !!isError);
  }

  async function refreshSubmissionAccess() {
    var result = await client.rpc('get_common_ground_event_state');
    if (result.error) throw result.error;
    var status = Array.isArray(result.data) ? result.data[0] : result.data || {};
    if (typeof status.submissions_closed !== 'boolean') throw new Error('Missing submission access status.');
    submissionsOpen = !status.submissions_closed;
    $('submission-access-toggle').disabled = false;
    $('submission-access-toggle').textContent = submissionsOpen ? 'Close submissions' : 'Open submissions';
    submissionAccessMessage(
      submissionsOpen
        ? 'Submissions are open. Builders can save drafts, update projects, and submit final entries until you close them.'
        : 'Submissions are closed. Open them to accept new drafts, updates, and final entries.'
    );
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
    var cutoff = Date.parse('2026-10-13T00:00:00+08:00');
    var ends = Date.parse('2026-10-14T23:59:59+08:00');
    if (votingOpen) {
      peopleChoiceMessage('Voting is open · ' + readyCount + ' projects · ' + voteCount + ' votes cast.');
    } else if (paused) {
      peopleChoiceMessage('Voting is paused · ' + readyCount + ' projects · ' + voteCount + ' votes cast.');
    } else if (now < cutoff) {
      peopleChoiceMessage('Voting opens at 12:00 AM SGT Tuesday, 13 October and closes at 11:59 PM Wednesday, 14 October · ' + readyCount + ' ready projects.');
    } else if (now < ends) {
      peopleChoiceMessage('Voting is closed · ' + readyCount + ' ready projects · ' + voteCount + ' votes cast.');
    } else {
      peopleChoiceMessage('Voting has ended · ' + readyCount + ' projects · ' + voteCount + ' votes cast.');
    }
    $('people-choice-pause').hidden = !votingOpen;
    $('people-choice-resume').hidden = votingOpen || !paused || now < cutoff || now >= ends;
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
  $('submission-access-toggle').addEventListener('click', async function () {
    this.disabled = true;
    try {
      var result = await client.rpc('set_common_ground_submissions_open', {
        p_open: !submissionsOpen,
        p_event_id: 'common-ground-2026-10-11'
      });
      if (result.error) throw result.error;
      await refreshSubmissionAccess();
      await refreshSubmissionRows();
      render();
    } catch (error) {
      submissionAccessMessage(error && error.message ? error.message : 'Could not update submission access.', true);
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
    try { await refreshSubmissionAccess(); }
    catch (error) {
      $('submission-access-toggle').disabled = true;
      submissionAccessMessage(error && error.message ? error.message : 'Could not load submission access.', true);
    }
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
    if (!submissionAccessTimer) submissionAccessTimer = window.setInterval(function () {
      if (document.hidden) return;
      refreshSubmissionAccess().catch(function () { /* Keep the last known organiser control state visible. */ });
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
    var submit = $('inbox-login').querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      await window.CGSubmission.signIn(email);
      $('inbox-code').value = '';
      $('inbox-login').hidden = true;
      $('inbox-code-form').hidden = false;
      $('inbox-code').focus();
      message('We sent an 8-digit code to ' + email + '. Enter it here to open the organiser inbox.');
    } catch (_err) { message(window.CGSubmission.signInErrorMessage(_err), true); }
    finally { submit.disabled = false; }
  });
  $('inbox-code-form').addEventListener('submit', async function (event) {
    event.preventDefault();
    var email = $('inbox-email').value.trim().toLowerCase();
    var token = $('inbox-code').value.replace(/\D/g, '');
    var submit = $('inbox-code-form').querySelector('button[type="submit"]');
    submit.disabled = true;
    message('Verifying your code…');
    try {
      var verified = await window.CGSubmission.verifyEmailCode(email, token);
      $('inbox-code-form').hidden = true;
      await handleSession({user:verified.user || (verified.session && verified.session.user)});
    } catch (_err) {
      message('That code is invalid, expired, or already used. Check the newest email or request a new code.', true);
    } finally { submit.disabled = false; }
  });
  $('inbox-resend').addEventListener('click', async function () {
    var email = $('inbox-email').value.trim().toLowerCase();
    this.disabled = true;
    try {
      await window.CGSubmission.signIn(email);
      $('inbox-code').value = '';
      message('We sent a new 8-digit code to ' + email + '. Use the newest code.');
      $('inbox-code').focus();
    } catch (_err) { message(window.CGSubmission.signInErrorMessage(_err), true); }
    finally { this.disabled = false; }
  });
  $('inbox-change-email').addEventListener('click', function () {
    $('inbox-code-form').hidden = true;
    $('inbox-login').hidden = false;
    $('inbox-code').value = '';
    $('inbox-email').focus();
    message('Enter the organiser email to request a code.');
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
    var tracks = [
      {sheetName:'Design × Tech', track:'Design × Tech', judges:['Clement Zheng','Phil Hedayatnia','Lucian Grey']},
      {sheetName:'Culture × Tech', track:'Culture × Tech', judges:['Yee Chia','Ilke Senturk','Yaziz Hassan']}
    ];
    var readyRows = allRows.filter(function (row) { return row.status === 'ready'; });
    var workbook = XLSX.utils.book_new();
    var galleryBase = new URL('./', window.location.href);

    function buildTrackSheet(definition) {
      var dataRows = [
        ['COMMON GROUND — ' + definition.track.toUpperCase() + ' JUDGING'],
        ['Score each criterion 1–5: 1 Weak · 2 Below expectations · 3 Meets expectations · 4 Strong · 5 Exceptional. Each judge can award 20 marks; project total is out of 60.'],
        ['TOP FOUR — AUTOMATICALLY RANKED BY FINAL MARKS'],
        ['RANK', 'TEAM NAME', 'PROJECT NAME', 'FINAL MARKS / 60'],
        ['', '', '', ''],
        ['', '', '', ''],
        ['', '', '', ''],
        ['', '', '', ''],
        ['PROJECT SCORE SHEET'],
        ['TEAM NAME', 'PROJECT NAME', 'PROJECT GALLERY', 'JUDGE', 'CONCEPT', 'TRACK FIT', 'EXECUTION', 'PRESENTATION', 'FINAL MARKS / 60']
      ];
      var groups = readyRows.filter(function (row) {
        var selected = row.project && Array.isArray(row.project.tracks) ? row.project.tracks : [];
        return selected.indexOf(definition.track) !== -1;
      });
      var groupRows = [];
      groups.forEach(function (row) {
        var firstRow = dataRows.length;
        dataRows.push([row.team && row.team.name || '', row.project && row.project.name || '', 'Open project in gallery ↗', definition.judges[0], '', '', '', '', '']);
        dataRows.push(['', '', '', definition.judges[1], '', '', '', '', '']);
        dataRows.push(['', '', '', definition.judges[2], '', '', '', '', '']);
        groupRows.push({row:row,start:firstRow});
      });
      if (!groups.length) dataRows.push(['No ready submissions for this track yet.']);

      var sheet = XLSX.utils.aoa_to_sheet(dataRows);
      var merges = [
        {s:{r:0,c:0},e:{r:0,c:8}},
        {s:{r:1,c:0},e:{r:1,c:8}},
        {s:{r:2,c:0},e:{r:2,c:8}},
        {s:{r:8,c:0},e:{r:8,c:8}}
      ];
      if (!groups.length) merges.push({s:{r:10,c:0},e:{r:10,c:8}});
      var firstProjectExcelRow = groupRows.length ? groupRows[0].start + 1 : 0;
      var lastProjectExcelRow = groupRows.length ? groupRows[groupRows.length - 1].start + 1 : 0;
      groupRows.forEach(function (group) {
        var row = group.row;
        var start = group.start;
        var end = start + 2;
        [0,1,2,8].forEach(function (column) {
          merges.push({s:{r:start,c:column},e:{r:end,c:column}});
        });
        var projectId = row.id || row.submission_id || '';
        var galleryUrl = new URL(galleryBase.toString());
        if (projectId) galleryUrl.searchParams.set('project', projectId);
        galleryUrl.hash = 'project-gallery';
        var galleryCell = XLSX.utils.encode_cell({r:start,c:2});
        sheet[galleryCell] = {
          t:'s',
          v:'Open project in gallery ↗',
          l:{Target:galleryUrl.toString(),Tooltip:'Open this project in the public gallery'}
        };
        var firstExcelRow = start + 1;
        var lastExcelRow = end + 1;
        var totalCell = XLSX.utils.encode_cell({r:start,c:8});
        sheet[totalCell] = {
          t:'n',
          f:'IF(COUNT(E' + firstExcelRow + ':H' + lastExcelRow + ')=12,SUM(E' + firstExcelRow + ':H' + lastExcelRow + '),"")'
        };
        var rankCell = XLSX.utils.encode_cell({r:start,c:9});
        sheet[rankCell] = {
          t:'n',
          f:'IF(I' + firstExcelRow + '="","",RANK(I' + firstExcelRow + ',$I$' + firstProjectExcelRow + ':$I$' + lastProjectExcelRow + ',0)+COUNTIF($I$' + firstProjectExcelRow + ':I' + firstExcelRow + ',I' + firstExcelRow + ')-1)'
        };
      });
      if (groupRows.length) {
        for (var rank = 1; rank <= 4; rank++) {
          var summaryRow = rank + 3;
          var summaryExcelRow = summaryRow + 1;
          var rankKeyCell = XLSX.utils.encode_cell({r:summaryRow,c:10});
          var rankCell = XLSX.utils.encode_cell({r:summaryRow,c:0});
          var teamCell = XLSX.utils.encode_cell({r:summaryRow,c:1});
          var projectCell = XLSX.utils.encode_cell({r:summaryRow,c:2});
          var scoreCell = XLSX.utils.encode_cell({r:summaryRow,c:3});
          var matchFormula = 'MATCH($K$' + summaryExcelRow + ',$J$' + firstProjectExcelRow + ':$J$' + lastProjectExcelRow + ',0)';
          sheet[rankKeyCell] = {t:'n',v:rank};
          sheet[rankCell] = {t:'n',f:'IF(B' + summaryExcelRow + '="","",K' + summaryExcelRow + ')'};
          sheet[teamCell] = {
            t:'s',
            f:'IFERROR(INDEX($A$' + firstProjectExcelRow + ':$A$' + lastProjectExcelRow + ',' + matchFormula + '),"")'
          };
          sheet[projectCell] = {
            t:'s',
            f:'IFERROR(INDEX($B$' + firstProjectExcelRow + ':$B$' + lastProjectExcelRow + ',' + matchFormula + '),"")'
          };
          sheet[scoreCell] = {
            t:'n',
            f:'IFERROR(INDEX($I$' + firstProjectExcelRow + ':$I$' + lastProjectExcelRow + ',' + matchFormula + '),"")'
          };
        }
      }
      sheet['!merges'] = merges;
      sheet['!cols'] = [
        {wch:24},{wch:30},{wch:25},{wch:14},
        {wch:18},{wch:18},{wch:18},{wch:18},{wch:19},
        {hidden:true,wch:0},{hidden:true,wch:0}
      ];
      sheet['!rows'] = [{hpt:30},{hpt:36},{hpt:26}];
      for (var rowIndex=3; rowIndex<dataRows.length; rowIndex++) sheet['!rows'].push({hpt:25});
      return sheet;
    }

    tracks.forEach(function (definition) {
      XLSX.utils.book_append_sheet(workbook, buildTrackSheet(definition), definition.sheetName);
    });
    workbook.Props = {
      Title:'Common Ground Makeathon judging sheets',
      Subject:'Two track sheets with three judges and four scoring criteria per project',
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
