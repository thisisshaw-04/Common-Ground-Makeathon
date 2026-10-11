/* Common Ground — front portal (builder-facing).
   Renders the event portal and checks attendee eligibility with Supabase. */
(function () {
  'use strict';

  var data = CGData.load();
  var current = null;
  window.CGBuilderEligibility = false;

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var toastTimer;
  function toast(msg) {
    var el = $('toast');
    el.textContent = msg;
    el.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('visible'); }, 2200);
  }

  /* ---------------- render event content ---------------- */
  function renderEvent() {
    var e = data.event;
    $('hero-tagline').textContent = e.tagline;
    $('meta-dates').textContent = e.dates;
    $('meta-venue').textContent = e.venue;
    $('meta-hours').textContent = e.hours;
    $('meta-note').textContent = e.heroNote;
    $('foot-dates').textContent = e.dates;
    document.title = e.name + ' — Makeathon';

    $('schedule').innerHTML = (e.schedule || []).map(function (row, index) {
      return '<div class="sched-row" data-schedule-index="' + index + '">' +
        '<time>' + esc(row.time) + '</time>' +
        '<strong>' + esc(row.title) + '</strong>' +
        '<span>' + esc(row.detail) + '</span></div>';
    }).join('');
    renderTimelineLabels();

    $('faq').innerHTML = (e.faq || []).map(function (item) {
      return '<div><h3>' + esc(item.q) + '</h3><p>' + esc(item.a) + '</p></div>';
    }).join('');
  }


  /* ---------------- tab navigation ---------------- */
  var panelNames = ['overview', 'access', 'schedule', 'faq', 'choice'];
  function activatePanel(name, updateHash) {
    if (panelNames.indexOf(name) === -1) return;
    document.querySelectorAll('[data-portal-panel]').forEach(function (panel) {
      panel.hidden = panel.getAttribute('data-portal-panel') !== name;
    });
    document.querySelectorAll('.portal-tab[role="tab"]').forEach(function (tab) {
      var active = tab.getAttribute('data-panel-select') === name;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
      tab.tabIndex = active ? 0 : -1;
    });
    if (updateHash) {
      history.replaceState(null, '', '#' + name);
      window.scrollTo({top:0, behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
    }
    document.dispatchEvent(new CustomEvent('cg-portal-tab-change', {detail:{panel:name}}));
  }
  document.addEventListener('click', function (event) {
    var control = event.target.closest('[data-panel-select]');
    if (!control) return;
    event.preventDefault();
    activatePanel(control.getAttribute('data-panel-select'), true);
  });
  document.querySelectorAll('.portal-tab[role="tab"]').forEach(function (tab, index, tabs) {
    tab.addEventListener('keydown', function (event) {
      var next = null;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
      if (next === null) return;
      event.preventDefault();
      tabs[next].focus();
      activatePanel(tabs[next].getAttribute('data-panel-select'), true);
    });
  });
  var namedHash = location.hash.match(/^#(overview|access|schedule|faq|choice)$/i);
  var legacyHash = location.hash.match(/^#(?:part-|portal-tab-)([abc])$/i);
  var legacyPanels = {a:'access', b:'schedule', c:'choice'};
  activatePanel(namedHash ? namedHash[1].toLowerCase() : legacyHash ? legacyPanels[legacyHash[1].toLowerCase()] : 'overview', false);

  /* ---------------- live schedule and server cutoff ---------------- */
  var EVENT_START_AT = Date.parse('2026-10-11T09:00:00+08:00');
  var SUBMISSION_CUTOFF_AT = Date.parse('2026-10-11T15:15:00+08:00');
  var EVENT_END_AT = Date.parse('2026-10-11T17:00:00+08:00');
  var serverClockOffset = 0;
  var eventStatus = {
    current_at: new Date().toISOString(),
    submissions_closed: Date.now() >= SUBMISSION_CUTOFF_AT,
    gallery_open: Date.now() >= SUBMISSION_CUTOFF_AT,
    voting_open: Date.now() >= SUBMISSION_CUTOFF_AT && Date.now() < EVENT_END_AT,
    authoritative: false
  };
  window.CGEventStatus = eventStatus;

  function eventNow() { return Date.now() + serverClockOffset; }
  function renderTimelineLabels() {
    var target = $('timeline-labels');
    if (!target) return;
    var rows = data.event.schedule || [];
    var indices = [0, 2, 5, 6, rows.length - 1].filter(function (value, index, all) {
      return value >= 0 && all.indexOf(value) === index;
    });
    target.innerHTML = indices.map(function (index) {
      return '<span data-timeline-index="' + index + '">' + esc(rows[index].time) + '</span>';
    }).join('');
  }
  function formatCountdown(ms) {
    var seconds = Math.max(0, Math.floor(ms / 1000));
    var hours = Math.floor(seconds / 3600);
    var minutes = Math.floor((seconds % 3600) / 60);
    var remainder = seconds % 60;
    return (hours ? hours + 'h ' : '') + minutes + 'm ' + remainder + 's';
  }
  function updateScheduleProgress() {
    var now = eventNow();
    var span = EVENT_END_AT - EVENT_START_AT;
    var progress = Math.max(0, Math.min(1, (now - EVENT_START_AT) / span));
    var fill = $('timeline-fill'), cursor = $('timeline-cursor');
    if (fill) fill.style.width = (progress * 100) + '%';
    if (cursor) cursor.style.left = (progress * 100) + '%';

    var rows = data.event.schedule || [];
    var activeIndex = 0;
    rows.forEach(function (row, index) {
      var at = Date.parse('2026-10-11T' + row.time + ':00+08:00');
      if (now >= at) activeIndex = index;
    });
    document.querySelectorAll('.sched-row').forEach(function (row) {
      var index = Number(row.getAttribute('data-schedule-index'));
      row.classList.toggle('is-active', now >= EVENT_START_AT && now < EVENT_END_AT && index === activeIndex);
      row.classList.toggle('is-complete', now >= EVENT_START_AT && index < activeIndex);
      if (index === activeIndex && now >= EVENT_START_AT && now < EVENT_END_AT) row.setAttribute('aria-current', 'step');
      else row.removeAttribute('aria-current');
    });
    document.querySelectorAll('[data-timeline-index]').forEach(function (label) {
      label.classList.toggle('active', Number(label.getAttribute('data-timeline-index')) === activeIndex);
    });

    var phase = $('current-event-phase'), phaseLabel = $('event-phase-label'), label = $('countdown-label'), countdown = $('submission-countdown');
    if (phase) {
      if (now < EVENT_START_AT) {
        if (phaseLabel) phaseLabel.textContent = 'STARTS AT 9:00 AM SGT';
        phase.textContent = 'Check-in starts at 9:00 AM';
      } else if (now >= EVENT_END_AT) {
        if (phaseLabel) phaseLabel.textContent = 'EVENT COMPLETE';
        phase.textContent = 'The event has ended';
      } else {
        if (phaseLabel) phaseLabel.textContent = 'HAPPENING NOW';
        phase.textContent = 'Now: ' + (rows[activeIndex] ? rows[activeIndex].title : 'Makeathon');
      }
    }
    if (now < SUBMISSION_CUTOFF_AT) {
      if (label) label.textContent = 'SUBMISSIONS CLOSE IN';
      if (countdown) countdown.textContent = formatCountdown(SUBMISSION_CUTOFF_AT - now);
    } else if (now < EVENT_END_AT) {
      if (label) label.textContent = 'VOTING CLOSES IN';
      if (countdown) countdown.textContent = formatCountdown(EVENT_END_AT - now);
    } else {
      if (label) label.textContent = 'SUBMISSIONS + VOTING';
      if (countdown) countdown.textContent = 'Closed';
    }
  }
  function updateSubmissionAvailability() {
    var closed = !!eventStatus.submissions_closed;
    var eligible = window.CGBuilderEligibility === true;
    var codeAccess = !!(current && current.status === 'confirmed' && CGData.codesOpen(data.event));
    var canSubmit = eligible && codeAccess && !closed;
    if ($('team-section')) $('team-section').hidden = !canSubmit;
    if ($('submission-section')) $('submission-section').hidden = !canSubmit;
    if ($('submission-locked')) $('submission-locked').hidden = closed || canSubmit;
  }
  function publishEventStatus(next) {
    eventStatus = next;
    window.CGEventStatus = eventStatus;
    updateSubmissionAvailability();
    document.dispatchEvent(new CustomEvent('cg-event-status', {detail:eventStatus}));
    updateScheduleProgress();
  }
  function localEventFallback() {
    var now = Date.now();
    var closed = now >= SUBMISSION_CUTOFF_AT;
    return {
      current_at: new Date(now).toISOString(),
      submissions_closed: closed,
      gallery_open: closed,
      voting_open: closed && now < EVENT_END_AT,
      authoritative: false
    };
  }
  async function refreshEventStatus() {
    var client = window.CGSubmission && window.CGSubmission.client;
    if (!client) {
      publishEventStatus(localEventFallback());
      return;
    }
    try {
      var result = await client.rpc('get_common_ground_event_state');
      if (result.error) throw result.error;
      var row = Array.isArray(result.data) ? result.data[0] : result.data;
      if (!row || !row.current_at) throw new Error('Missing event status');
      var serverNow = Date.parse(row.current_at);
      if (!Number.isFinite(serverNow)) throw new Error('Invalid event time');
      serverClockOffset = serverNow - Date.now();
      publishEventStatus({
        current_at: row.current_at,
        submissions_closed: !!row.submissions_closed,
        gallery_open: !!row.gallery_open,
        voting_open: !!row.voting_open,
        authoritative: true
      });
    } catch (_error) {
      publishEventStatus(localEventFallback());
    }
  }

  /* ---------------- authenticated builder access ---------------- */
  function showError(msg) {
    var el = $('gate-error');
    el.textContent = msg;
    el.classList.add('visible');
    $('result').classList.remove('visible');
  }

  function clearError() {
    $('gate-error').classList.remove('visible');
  }

  function setGateStatus(message) {
    $('gate-status').textContent = message || '';
  }

  function clearBuilderAccess() {
    current = null;
    window.CGBuilderParticipant = null;
    window.CGBuilderEligibility = false;
    document.dispatchEvent(new CustomEvent('cg-builder-participant', { detail: { participant: null } }));
    document.dispatchEvent(new CustomEvent('cg-builder-eligibility', { detail: { eligible: false } }));
    $('result').classList.remove('visible');
    $('team-section').hidden = true;
    $('submission-section').hidden = true;
    updateSubmissionAvailability();
    $('p-detail').textContent = '—';
    $('perks').innerHTML = '';
  }

  var accessCheck = 0;
  async function handlePortalSession(session) {
    var request = ++accessCheck;
    var user = session && session.user;
    $('portal-signout').hidden = !user;
    if (!user) {
      clearBuilderAccess();
      setGateStatus('');
      return;
    }
    var email = String(user.email || '').trim().toLowerCase();
    if (!email) {
      clearBuilderAccess();
      showError('This sign-in does not include an email address. Contact an organiser.');
      return;
    }
    var client = window.CGSubmission && window.CGSubmission.client;
    if (!client) {
      clearBuilderAccess();
      showError('Secure sign-in is not configured yet. Contact an organiser.');
      return;
    }
    try {
      var result = await client.rpc('is_current_user_eligible');
      if (request !== accessCheck) return;
      if (result.error) throw result.error;
      if (result.data !== true) {
        clearBuilderAccess();
        showError('This email is not on the approved builder list. If you registered with a different address, sign out and try that one.');
        return;
      }
      clearError();
      setGateStatus('Signed in and verified. Your claims and team draft are tied to this email.');
      var returnPanel = location.hash.match(/^#(access|schedule|faq|choice)$/i);
      if (!returnPanel) activatePanel('access', true);
      renderResult({
        email: email,
        name: user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name) || email,
        team: '',
        ticket: 'BUILDER',
        status: 'confirmed',
        token: ''
      });
    } catch (_err) {
      if (request !== accessCheck) return;
      clearBuilderAccess();
      showError('We could not verify this account right now. Please reload and try again.');
    }
  }

  function renderResult(p) {
    current = p;
    window.CGBuilderParticipant = p;
    window.CGBuilderEligibility = true;
    document.dispatchEvent(new CustomEvent('cg-builder-participant', { detail: { participant: p } }));
    document.dispatchEvent(new CustomEvent('cg-builder-eligibility', { detail: { eligible: true, email: p.email } }));
    clearError();

    $('p-name').textContent = p.name || p.email;
    $('p-detail').textContent = [p.email, p.team, p.ticket].filter(Boolean).join('  ·  ');

    var status = $('p-status');
    status.textContent = String(p.status || '').toUpperCase();
    status.className = 'badge ' + (p.status === 'confirmed' ? 'ok' : 'warn');

    var open = p.status === 'confirmed' && CGData.codesOpen(data.event);
    $('p-token').textContent = open ? 'APPROVED BUILDER' : 'ACCESS NOT AVAILABLE';
    $('token-copy').hidden = true;
    $('release-notice').textContent = p.status === 'confirmed' && !open ? 'Your builder access is confirmed. Promo claims and submissions open on ' + CGData.releaseLabel(data.event) + '.' : '';
    $('release-notice').hidden = !$('release-notice').textContent;
    var ready = open && !eventStatus.submissions_closed;
    $('team-section').hidden = !ready;
    $('submission-section').hidden = !ready;
    updateSubmissionAvailability();
    if (ready) { loadTeam(p); loadProject(p); }

    // The real offers are shown in the authenticated Supabase claim panel below.
    $('perks').innerHTML = '';

    var result = $('result');
    result.classList.add('visible');
    result.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
  }

  var memberId = 0;
  function teamKey(p) { return 'cg-team-draft-v1:' + p.email.trim().toLowerCase(); }
  function addMember(member) {
    member = member || {};
    var row = document.createElement('fieldset');
    var id = ++memberId;
    row.className = 'team-member';
    row.innerHTML = '<legend>Teammate</legend><div class="field-row">' +
      '<label class="field"><span>NAME</span><input class="member-name" required maxlength="100" value="' + esc(member.name || '') + '"></label>' +
      '<label class="field"><span>EMAIL</span><input class="member-email" type="email" required maxlength="254" value="' + esc(member.email || '') + '"></label></div>' +
      '<button type="button" class="btn btn-sm remove-member" aria-label="Remove teammate ' + id + '">Remove teammate</button>';
    $('team-members').appendChild(row);
    return row;
  }
  function loadTeam(p) {
    var draft = null;
    try { draft = JSON.parse(localStorage.getItem(teamKey(p))); } catch (err) { /* Start with an empty draft. */ }
    $('team-contact').textContent = 'Team contact: ' + (p.name || '') + ' · ' + p.email;
    $('team-name').value = draft && draft.name || p.team || '';
    $('team-members').innerHTML = '';
    (draft && Array.isArray(draft.members) ? draft.members : []).forEach(addMember);
    $('team-feedback').textContent = draft ? 'Your saved team draft is ready to edit.' : '';
  }
  $('add-teammate').addEventListener('click', function () { addMember().querySelector('input').focus(); });
  $('team-members').addEventListener('click', function (ev) {
    if (ev.target.closest('.remove-member')) {
      ev.target.closest('fieldset').remove();
      $('add-teammate').focus();
    }
  });
  $('team-form').addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (!current || current.status !== 'confirmed' || !CGData.codesOpen(data.event) || $('team-section').hidden) return;
    var name = $('team-name').value.trim();
    var seen = [current.email.trim().toLowerCase()];
    var members = [];
    var error = name ? '' : 'Enter a team name.';
    document.querySelectorAll('.team-member').forEach(function (row) {
      var n = row.querySelector('.member-name').value.trim();
      var email = row.querySelector('.member-email').value.trim().toLowerCase();
      if (!n || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) error = 'Enter a name and valid email for each teammate.';
      if (seen.indexOf(email) !== -1) error = 'Each email must be unique. You are already included as the team contact.';
      seen.push(email); members.push({name:n, email:email});
    });
    if (error) { $('team-feedback').textContent = error; return; }
    try {
      localStorage.setItem(teamKey(current), JSON.stringify({name:name, contact:{name:current.name, email:current.email}, members:members, updatedAt:new Date().toISOString()}));
      $('team-feedback').textContent = 'Team draft saved in this browser. You can return to edit it.';
      updateProjectTeam();
    } catch (err) { $('team-feedback').textContent = 'Could not save. Keep this page open and allow browser storage, then try again.'; }
  });

  // Storage adapter is deliberately separate from the form: replace these methods
  // with authenticated API calls when central submission storage is connected.
  var projectStore = {
    key: function (p) { return 'cg-project-draft-v1:' + p.email.trim().toLowerCase(); },
    load: function (p) { return JSON.parse(localStorage.getItem(this.key(p)) || 'null'); },
    save: function (p, record) { localStorage.setItem(this.key(p), JSON.stringify(record)); }
  };
  var projectFieldIds = {
    name:'project-name', oneLiner:'project-one-liner', inspiration:'project-inspiration',
    solution:'project-solution', interesting:'project-interesting', technology:'project-technology',
    made:'project-made', experiment:'project-experiment', next:'project-next',
    demo:'project-demo', video:'project-video', source:'project-source', prototype:'project-prototype',
    supporting:'project-supporting', designReflection:'project-design-reflection',
    cultureReflection:'project-culture-reflection', collaboration:'project-collaboration', attribution:'project-attribution'
  };
  function updateProjectTeam() {
    var team = null;
    try { team = JSON.parse(localStorage.getItem(teamKey(current))); } catch (err) { /* No saved team. */ }
    $('submission-team').textContent = team ? 'Team: ' + team.name + ' · ' + (team.members.length + 1) + ' members (including you)' : 'Save your team details above before marking your project ready.';
    return team;
  }
  function loadProject(p) {
    var saved = null;
    try { saved = projectStore.load(p); } catch (err) { /* An unreadable draft remains untouched until saved. */ }
    var project = saved && saved.project || {};
    if (!project.solution && project.description) project.solution = project.description;
    Object.keys(projectFieldIds).forEach(function (key) {
      $(projectFieldIds[key]).value = project[key] || '';
    });
    $('project-no-code').checked = !!project.noCode;
    document.querySelectorAll('input[name="project-track"]').forEach(function (input) {
      input.checked = Array.isArray(project.tracks) && project.tracks.indexOf(input.value) !== -1;
    });
    updateProjectTeam();
    document.dispatchEvent(new Event('cg-project-draft-loaded'));
    $('submission-feedback').textContent = saved ? (saved.status === 'ready' ? 'Saved submission loaded.' : 'Saved project draft loaded.') : 'No project draft saved yet.';
  }
  function saveProject() {
    if (!current || $('submission-section').hidden || !CGData.codesOpen(data.event) || eventStatus.submissions_closed) return null;
    var project = {};
    Object.keys(projectFieldIds).forEach(function (key) { project[key] = $(projectFieldIds[key]).value.trim(); });
    project.tracks = Array.prototype.slice.call(document.querySelectorAll('input[name="project-track"]:checked')).map(function (input) { return input.value; });
    project.noCode = $('project-no-code').checked;
    var team = updateProjectTeam() || {};
    var record = {schemaVersion:1, eventId:'common-ground-2026-10-11', ownerEmail:current.email.trim().toLowerCase(), status:'draft', project:project, team:team, updatedAt:new Date().toISOString()};
    try { projectStore.save(current, record); }
    catch (err) { $('submission-feedback').textContent = 'Could not save. Allow browser storage and try again.'; return null; }
    $('submission-feedback').textContent = 'Project draft saved on this device. You can come back to finish it.';
    return record;
  }
  $('submission-form').addEventListener('submit', function (ev) { ev.preventDefault(); saveProject(); });
  $('submission-form').addEventListener('input', function () { $('submission-feedback').textContent = 'Unsaved changes. Save your draft to keep these edits.'; });
  $('project-ready').addEventListener('click', function () { saveProject(); });
  $('project-download').addEventListener('click', function () {
    var record = saveProject();
    if (!record) return;
    var url = URL.createObjectURL(new Blob([JSON.stringify(record, null, 2)], {type:'application/json'}));
    var link = document.createElement('a'); link.href = url; link.download = 'common-ground-project-draft.json'; link.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  });

  $('gate-form').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    clearError();
    setGateStatus('');
    var value = $('email').value.trim().toLowerCase();
    if (!value || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
      showError('Enter a valid registration email address.');
      return;
    }
    var auth = window.CGSubmission;
    if (!auth || !auth.client) {
      showError('Supabase sign-in is not configured yet. Contact an organiser.');
      return;
    }
    var session = auth.getSession();
    if (session && session.user && String(session.user.email || '').trim().toLowerCase() === value) {
      await handlePortalSession(session);
      return;
    }
    try {
      await auth.signIn(value);
      setGateStatus('If this is your approved email, check your inbox and spam folder. Open the newest link in this browser; your access will appear here.');
    } catch (_err) {
      showError(window.CGSubmission.signInErrorMessage(_err));
    }
  });

  function updateGateEventLink() {
    var emailEntered = !!$('email').value.trim();
    $('gate-luma').hidden = !emailEntered;
  }
  updateGateEventLink();
  $('email').addEventListener('input', function () { clearError(); setGateStatus(''); updateGateEventLink(); });
  $('portal-signout').addEventListener('click', async function () {
    try { await window.CGSubmission.signOut(); }
    catch (_err) { showError('Could not sign out. Reload the page and try again.'); }
  });
  document.addEventListener('cg-submission-auth', function (event) {
    handlePortalSession(event.detail && event.detail.session);
  });

  /* ---------------- copy buttons (delegated) ---------------- */
  document.addEventListener('click', function (ev) {
    var btn = ev.target.closest('[data-copy-target]');
    if (!btn) return;
    var src = $(btn.getAttribute('data-copy-target'));
    if (!src) return;
    var text = src.textContent.trim();
    if (!text || text === '—' || text === 'NOT ISSUED') return;

    var label = btn.textContent;
    function done() {
      btn.textContent = '✓ Copied';
      btn.classList.add('done');
      toast('Copied ' + text);
      setTimeout(function () { btn.textContent = label; btn.classList.remove('done'); }, 1600);
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { toast('Copy failed — select it by hand.'); });
    } else {
      // file:// and older browsers
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { toast('Copy failed — select it by hand.'); }
      document.body.removeChild(ta);
    }
  });

  /* Pick up admin edits made in another tab. */
  window.addEventListener('storage', function (ev) {
    if (ev.key !== CGData.STORE_KEY) return;
    data = CGData.load();
    renderEvent();
    toast('Portal content updated');
  });

  var wasOpen = CGData.codesOpen(data.event);
  setInterval(function () {
    var isOpen = CGData.codesOpen(data.event);
    if (isOpen !== wasOpen) {
      wasOpen = isOpen;
      if (current) renderResult(current);
    }
    updateScheduleProgress();
  }, 1000);
  setInterval(refreshEventStatus, 15000);

  renderEvent();
  refreshEventStatus();
  function cleanAuthEmailParam() {
    var url = new URL(location.href);
    if (!url.searchParams.has('email')) return;
    url.searchParams.delete('email');
    history.replaceState(null, '', url.pathname + url.search + url.hash);
  }
  if (!window.CGSubmission) {
    showError('Supabase sign-in is not configured yet. Contact an organiser.');
  } else {
    window.CGSubmission.ready.then(function (session) {
      cleanAuthEmailParam();
      return handlePortalSession(session);
    }).catch(function () {
      showError('Supabase could not start. Reload the page and try again.');
    });
  }
})();
