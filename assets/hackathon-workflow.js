/* Supabase-backed builder submissions, finalist gallery, and People's Choice voting. */
(function () {
  'use strict';
  var EVENT_ID = 'common-ground-2026-10-11';
  var client = window.CGSubmission && window.CGSubmission.client;
  var $ = function (id) { return document.getElementById(id); };
  var session = null, eligible = false, rowId = null;
  var html = function (value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); };
  function setStatus(message, error) {
    $('workflow-status').textContent = message;
    $('workflow-status').classList.toggle('error', !!error);
  }
  function safeHref(value) {
    try { var url = new URL(value); return /^https?:$/.test(url.protocol) ? html(url.href) : ''; }
    catch (_err) { return ''; }
  }
  function listLines(value) {
    return String(value || '').split(/\r?\n/).map(function (line) { return line.trim(); }).filter(Boolean);
  }
  function countWords(values) {
    var text = values.map(function (value) { return String(value || '').trim(); }).filter(Boolean).join(' ');
    return text ? text.split(/\s+/).length : 0;
  }
  function renderEvent() {
    var data = window.CGData && window.CGData.load();
    if (!data || !data.event) return;
    $('hero-edition').textContent = data.event.edition || 'COMMON GROUND / 2026';
    $('hero-tagline').textContent = data.event.tagline || '';
    $('meta-dates').textContent = data.event.dates || '';
    $('meta-venue').textContent = data.event.venue || '';
    $('meta-hours').textContent = data.event.hours || '';
    $('meta-note').textContent = data.event.heroNote || '';
    $('foot-dates').textContent = data.event.dates || '';
    $('top-caption').textContent = 'BUILDER PORTAL / ' + (data.event.edition || '2026');
    document.title = (data.event.name || 'Common Ground') + ' — Builder Portal';
    $('intro-grid').innerHTML = (data.event.intro || []).map(function (item, index) {
      return '<article class="intro-card"><span class="idx">' + String(index + 1).padStart(2, '0') + '</span><h3>' + html(item.title) + '</h3><p>' + html(item.body) + '</p></article>';
    }).join('');
    $('schedule').innerHTML = (data.event.schedule || []).map(function (item) {
      return '<div class="sched-row"><time>' + html(item.time) + '</time><strong>' + html(item.title) + '</strong><span>' + html(item.detail) + '</span></div>';
    }).join('');
    $('faq').innerHTML = (data.event.faq || []).map(function (item) {
      return '<div><h3>' + html(item.q) + '</h3><p>' + html(item.a) + '</p></div>';
    }).join('');
  }
  function trackValues() {
    return Array.prototype.map.call(document.querySelectorAll('[name="project-tracks"]:checked'), function (input) { return input.value; });
  }
  function updateWordCounts() {
    $('overview-count').textContent = countWords(['project-one-liner','project-inspiration','project-solution','project-interesting'].map(function (id) { return $(id).value; })) + ' / 100 words';
    $('build-count').textContent = countWords(['project-technology','project-current-build','project-experiment','project-next'].map(function (id) { return $(id).value; })) + ' / 100 words';
  }
  function updateTrackFields() {
    var tracks = trackValues();
    document.querySelectorAll('[data-track-reflection]').forEach(function (node) {
      node.hidden = tracks.indexOf(node.getAttribute('data-track-reflection')) === -1;
    });
    document.querySelectorAll('[name="project-tracks"]').forEach(function (input) {
      input.disabled = !input.checked && tracks.length >= 2;
    });
  }
  function setParticipant(user) {
    var email = String(user && user.email || '').trim().toLowerCase();
    var participant = email ? {email:email, name:email, status:'confirmed', token:'', team:'', ticket:'BUILDER'} : null;
    window.CGBuilderParticipant = participant;
    document.dispatchEvent(new CustomEvent('cg-builder-participant', {detail:{participant:participant}}));
  }
  function showWorkspace(show) {
    $('builder-workspace').hidden = !show;
    $('workflow-login').hidden = !!session;
    $('workflow-signout').hidden = !session;
    $('project-gallery').hidden = !show;
    $('people-choice').hidden = !show;
    $('tool-code-claims').hidden = !show;
  }
  function field(id) { return $(id).value.trim(); }
  function getProject() {
    var overview = {
      oneLiner: field('project-one-liner'),
      inspiration: field('project-inspiration'),
      solution: field('project-solution'),
      interesting: field('project-interesting')
    };
    return {
      name: field('project-name'),
      tracks: trackValues(),
      oneLiner: overview.oneLiner,
      inspiration: overview.inspiration,
      solution: overview.solution,
      interesting: overview.interesting,
      overview: overview,
      technology: field('project-technology'),
      currentBuild: field('project-current-build'),
      experiment: field('project-experiment'),
      nextSteps: field('project-next'),
      designReflection: field('project-design-reflection'),
      cultureReflection: field('project-culture-reflection'),
      demo: field('project-demo'),
      video: field('project-video'),
      source: field('project-source'),
      sourceIsCode: !$('project-no-code').checked,
      prototype: field('project-prototype'),
      supportingMaterials: listLines(field('project-supporting')),
      setup: field('project-setup'),
      aiTools: field('project-ai'),
      thirdParty: field('project-third-party'),
      description: [overview.oneLiner, overview.inspiration, overview.solution, overview.interesting].filter(Boolean).join(' ')
    };
  }
  function getTeam() {
    return {
      name: field('team-name'),
      members: listLines(field('team-members')).map(function (name) { return {name:name}; }),
      collaboration: field('team-collaboration')
    };
  }
  function validateReady(project, team) {
    var tracks = project.tracks;
    var errors = [];
    if (!team.name) errors.push('Enter your team name.');
    if (!team.members.length) errors.push('List the names of all team members.');
    if (!team.collaboration) errors.push('Describe how your team collaborated.');
    if (!project.name) errors.push('Enter a project name.');
    if (tracks.length < 1 || tracks.length > 2) errors.push('Choose one or two tracks.');
    if (countWords([project.oneLiner, project.inspiration, project.solution, project.interesting]) > 100) errors.push('Keep the Project Overview to 100 words or fewer.');
    if (!project.oneLiner || !project.inspiration || !project.solution || !project.interesting) errors.push('Complete all four Project Overview prompts.');
    if (countWords([project.technology, project.currentBuild, project.experiment, project.nextSteps]) > 100) errors.push('Keep The Build to 100 words or fewer.');
    if (!project.technology || !project.currentBuild || !project.experiment || !project.nextSteps) errors.push('Complete all four The Build prompts.');
    if (!project.aiTools) errors.push('List the AI tools used, or enter “None”.');
    if (!project.thirdParty) errors.push('List external resources used, or enter “None”.');
    if (tracks.indexOf('design_tech') !== -1 && !project.designReflection) errors.push('Add the Design × Tech reflection.');
    if (tracks.indexOf('culture_tech') !== -1 && !project.cultureReflection) errors.push('Add the Culture × Tech reflection.');
    if (project.sourceIsCode && !project.source) errors.push('Add a GitHub/source link, or mark the project as not based on code.');
    var links = [project.demo, project.video, project.source, project.prototype].concat(project.supportingMaterials);
    if (!links.some(Boolean)) errors.push('Add at least one demo, video, source, prototype, or supporting link.');
    links.forEach(function (link) { if (link && !safeHref(link)) errors.push('Every project link must be a complete http:// or https:// URL.'); });
    return errors;
  }
  function fill(record) {
    var project = record.project || {};
    var team = record.team || {};
    $('team-name').value = team.name || '';
    $('team-members').value = (Array.isArray(team.members) ? team.members : []).map(function (member) { return typeof member === 'string' ? member : member.name || ''; }).filter(Boolean).join('\n');
    $('team-collaboration').value = team.collaboration || '';
    var map = {
      'project-name':'name','project-one-liner':'oneLiner','project-inspiration':'inspiration','project-solution':'solution','project-interesting':'interesting',
      'project-technology':'technology','project-current-build':'currentBuild','project-experiment':'experiment','project-next':'nextSteps',
      'project-design-reflection':'designReflection','project-culture-reflection':'cultureReflection',
      'project-demo':'demo','project-video':'video','project-source':'source','project-prototype':'prototype',
      'project-setup':'setup','project-ai':'aiTools','project-third-party':'thirdParty'
    };
    Object.keys(map).forEach(function (id) { $(id).value = project[map[id]] || ''; });
    $('project-supporting').value = (project.supportingMaterials || []).join('\n');
    $('project-no-code').checked = project.sourceIsCode === false;
    document.querySelectorAll('[name="project-tracks"]').forEach(function (input) { input.checked = Array.isArray(project.tracks) && project.tracks.indexOf(input.value) !== -1; });
    updateTrackFields(); updateWordCounts();
    rowId = record.id || null;
    setStatus(record.status === 'ready' ? 'Your saved submission is marked ready. You can update it until organisers close submissions.' : 'Your saved draft is loaded.');
  }
  async function loadSubmission(user) {
    $('project-form').reset();
    rowId = null;
    updateTrackFields(); updateWordCounts();
    var result = await client.from('submissions').select('id,event_id,user_id,status,project,team,created_at,updated_at')
      .eq('event_id', EVENT_ID).eq('user_id', user.id).maybeSingle();
    if (result.error) throw result.error;
    if (result.data) fill(result.data);
    else setStatus('Your account is eligible. Complete one submission per team; drafts are saved to this account.');
  }
  async function loadProjectGallery() {
    if (!eligible || !session) { $('project-gallery').hidden = true; return; }
    $('project-gallery').hidden = false;
    $('project-gallery-cards').innerHTML = '<p class="helper">Loading ready projects…</p>';
    try {
      var result = await client.rpc('get_ready_project_gallery', {p_event_id:EVENT_ID});
      if (result.error) throw result.error;
      var projects = result.data || [];
      if (!projects.length) {
        $('project-gallery-cards').innerHTML = '<p class="helper">Ready projects will appear here as teams submit them.</p>';
        return;
      }
      $('project-gallery-cards').innerHTML = projects.map(function (item) {
        var tracks = Array.isArray(item.tracks) ? item.tracks.map(function (track) { return ({design_tech:'Design × Tech',culture_tech:'Culture × Tech',best_use_of_tech:'Best Use of Tech',common_ground:'Common Ground Award'})[track] || track; }).join(' · ') : '';
        var links = [
          item.demo_url ? '<a href="' + safeHref(item.demo_url) + '" target="_blank" rel="noopener noreferrer">Live demo ↗</a>' : '',
          item.video_url ? '<a href="' + safeHref(item.video_url) + '" target="_blank" rel="noopener noreferrer">Demo video ↗</a>' : '',
          item.source_url ? '<a href="' + safeHref(item.source_url) + '" target="_blank" rel="noopener noreferrer">Source ↗</a>' : '',
          item.prototype_url ? '<a href="' + safeHref(item.prototype_url) + '" target="_blank" rel="noopener noreferrer">Prototype ↗</a>' : ''
        ].filter(Boolean).join('');
        return '<article class="finalist-card"><span class="eyebrow">' + html(tracks || 'READY PROJECT') + '</span><h3>' + html(item.project_name) + '</h3><p class="submission-meta">' + html(item.team_name) + '</p>' +
          (item.one_liner ? '<p><strong>' + html(item.one_liner) + '</strong></p>' : '') +
          (item.project_overview ? '<p>' + html(item.project_overview) + '</p>' : '') +
          (item.build_summary ? '<p>' + html(item.build_summary) + '</p>' : '') +
          (links ? '<div class="submission-links">' + links + '</div>' : '') + '</article>';
      }).join('');
    } catch (_error) {
      $('project-gallery-cards').innerHTML = '<p class="helper">Could not load the project gallery. Refresh or ask an organiser.</p>';
    }
  }
  async function loadGallery() {
    var area = $('people-choice');
    if (!eligible || !session) { area.hidden = true; return; }
    area.hidden = false;
    $('people-choice-cards').innerHTML = '<p class="helper">Loading finalist projects…</p>';
    try {
      var statusResult = await client.rpc('get_people_choice_status', {p_event_id:EVENT_ID});
      if (statusResult.error) throw statusResult.error;
      var state = Array.isArray(statusResult.data) ? statusResult.data[0] : statusResult.data;
      if (!state || !Number(state.finalist_count)) {
        $('people-choice-cards').innerHTML = '<p class="helper">Finalist projects will appear here when organisers publish the shortlist.</p>';
        $('people-choice-message').textContent = 'People’s Choice voting is not open yet.';
        return;
      }
      var finalistsResult = await client.rpc('get_people_choice_finalists', {p_event_id:EVENT_ID});
      if (finalistsResult.error) throw finalistsResult.error;
      var finalists = finalistsResult.data || [];
      $('people-choice-message').textContent = state.voting_open ? (state.my_vote ? 'Your vote is recorded. Each approved attendee can vote once.' : 'Voting is open. Choose one finalist.') : 'The finalist gallery is visible; voting is currently closed.';
      $('people-choice-cards').innerHTML = finalists.map(function (item) {
        var links = [
          item.demo_url ? '<a href="' + safeHref(item.demo_url) + '" target="_blank" rel="noopener noreferrer">Live demo ↗</a>' : '',
          item.demo_video_url ? '<a href="' + safeHref(item.demo_video_url) + '" target="_blank" rel="noopener noreferrer">Demo video ↗</a>' : '',
          item.prototype_url ? '<a href="' + safeHref(item.prototype_url) + '" target="_blank" rel="noopener noreferrer">Prototype ↗</a>' : ''
        ].filter(Boolean).join('');
        var alreadyVoted = !!state.my_vote;
        var vote = state.voting_open && !alreadyVoted
          ? '<button class="btn btn-primary" type="button" data-vote-for="' + html(item.submission_id) + '">Vote for this project</button>'
          : (alreadyVoted && state.my_vote === item.submission_id ? '<span class="vote-recorded">Your vote</span>' : '');
        return '<article class="finalist-card"><span class="eyebrow">FINALIST</span><h3>' + html(item.project_name) + '</h3><p class="submission-meta">' + html(item.team_name) + '</p>' +
          (item.one_liner ? '<p><strong>' + html(item.one_liner) + '</strong></p>' : '') +
          (item.project_overview ? '<p>' + html(item.project_overview) + '</p>' : '') +
          (links ? '<div class="submission-links">' + links + '</div>' : '') + vote + '</article>';
      }).join('');
    } catch (_error) {
      $('people-choice-cards').innerHTML = '<p class="helper">Could not load the finalist gallery. Refresh the page or ask an organiser.</p>';
      $('people-choice-message').textContent = '';
    }
  }
  async function handleSession(nextSession) {
    session = nextSession;
    eligible = false;
    showWorkspace(false);
    if (!session || !session.user) {
      setParticipant(null);
      $('workflow-email').value = '';
      setStatus(client ? 'Enter your approved registration email. We’ll email a secure sign-in link; no Google account is needed.' : 'The submission service is not configured.', !client);
      return;
    }
    var user = session.user;
    var email = String(user.email || '').trim().toLowerCase();
    $('workflow-email').value = email;
    setParticipant(user);
    setStatus('Checking your approved attendee access…');
    try {
      var check = await client.rpc('is_current_user_eligible');
      if (check.error) throw check.error;
      if (check.data !== true) {
        setStatus('This signed-in email is not on the approved attendee list. Check the address or ask an organiser for help.', true);
        return;
      }
      eligible = true;
      showWorkspace(true);
      setStatus('Signed in and verified for the Common Ground workspace as ' + email + '.');
      await loadSubmission(user);
      await loadProjectGallery();
      await loadGallery();
    } catch (_error) {
      showWorkspace(false);
      setStatus('Could not verify your access or load your submission. Refresh the page and try again.', true);
    }
  }
  async function saveSubmission(status) {
    if (!client || !session || !eligible) { setStatus('Sign in with an approved attendee email before saving.', true); return; }
    var project = getProject(), team = getTeam();
    if (status === 'ready') {
      var errors = validateReady(project, team);
      if (errors.length) { setStatus(errors[0], true); return; }
    }
    var user = session.user;
    var record = {
      event_id:EVENT_ID, user_id:user.id, owner_email:String(user.email || '').trim().toLowerCase(),
      status:status, project:project, team:team, updated_at:new Date().toISOString()
    };
    $('project-save').disabled = true; $('project-ready').disabled = true;
    setStatus(status === 'ready' ? 'Submitting…' : 'Saving draft…');
    try {
      var result = await client.from('submissions').upsert(record, {onConflict:'event_id,user_id'}).select('id,status').single();
      if (result.error) throw result.error;
      rowId = result.data.id;
      setStatus(status === 'ready' ? 'Submission received and marked ready. You can still edit it until organisers close submissions.' : 'Draft saved securely to Supabase. You can return on another device by signing in.');
    } catch (error) {
      setStatus('Could not save. ' + (error && error.message ? error.message : 'Please try again.'), true);
    } finally {
      $('project-save').disabled = false; $('project-ready').disabled = false;
    }
  }
  $('workflow-login').addEventListener('submit', async function (event) {
    event.preventDefault();
    var email = $('workflow-email').value.trim().toLowerCase();
    if (!email) return;
    if (!client) { setStatus('Supabase is not configured on this site.', true); return; }
    try {
      await window.CGSubmission.signIn(email);
      setStatus('Check your inbox for the secure sign-in link, then return to this page. You do not need a Google account.');
    } catch (_error) { setStatus('Could not send the sign-in link. Check the email address and try again.', true); }
  });
  $('workflow-signout').addEventListener('click', async function () {
    try { await window.CGSubmission.signOut(); }
    catch (_error) { setStatus('Could not sign out. Reload the page and try again.', true); }
  });
  $('project-form').addEventListener('submit', function (event) { event.preventDefault(); saveSubmission('draft'); });
  $('project-ready').addEventListener('click', function () { saveSubmission('ready'); });
  $('project-form').addEventListener('input', updateWordCounts);
  $('project-form').addEventListener('change', function (event) { if (event.target.name === 'project-tracks') updateTrackFields(); });
  document.addEventListener('click', async function (event) {
    var voteButton = event.target.closest('[data-vote-for]');
    if (!voteButton) return;
    if (!eligible || !session) return;
    voteButton.disabled = true;
    $('people-choice-message').textContent = 'Recording your vote…';
    try {
      var result = await client.rpc('cast_people_choice_vote', {p_submission_id:voteButton.getAttribute('data-vote-for'), p_event_id:EVENT_ID});
      if (result.error) throw result.error;
      await loadGallery();
    } catch (_error) {
      $('people-choice-message').textContent = 'Your vote could not be recorded. You may already have voted; refresh to check.';
      voteButton.disabled = false;
    }
  });
  document.addEventListener('cg-submission-auth', function (event) { handleSession(event.detail && event.detail.session); });
  renderEvent(); updateWordCounts(); updateTrackFields();
  if (!client) { handleSession(null); return; }
  window.CGSubmission.ready.then(handleSession).catch(function () { setStatus('Supabase could not start. Reload the page and try again.', true); });
})();