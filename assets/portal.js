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
    $('hero-edition').textContent = e.edition;
    $('hero-tagline').textContent = e.tagline;
    $('meta-dates').textContent = e.dates;
    $('meta-venue').textContent = e.venue;
    $('meta-hours').textContent = e.hours;
    $('meta-note').textContent = e.heroNote;
    $('foot-dates').textContent = e.dates;
    $('top-caption').textContent = 'BUILDER PORTAL / ' + e.edition;
    document.title = e.name + ' — Builder Portal';

    $('intro-grid').innerHTML = (e.intro || []).map(function (block, i) {
      return '<article class="intro-card">' +
        '<span class="idx">' + String(i + 1).padStart(2, '0') + '</span>' +
        '<h3>' + esc(block.title) + '</h3>' +
        '<p>' + esc(block.body) + '</p></article>';
    }).join('');

    $('schedule').innerHTML = (e.schedule || []).map(function (row) {
      return '<div class="sched-row">' +
        '<time>' + esc(row.time) + '</time>' +
        '<strong>' + esc(row.title) + '</strong>' +
        '<span>' + esc(row.detail) + '</span></div>';
    }).join('');

    $('faq').innerHTML = (e.faq || []).map(function (item) {
      return '<div><h3>' + esc(item.q) + '</h3><p>' + esc(item.a) + '</p></div>';
    }).join('');
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
    var ready = open;
    $('team-section').hidden = !ready;
    $('submission-section').hidden = !ready;
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
    if (!current || $('submission-section').hidden || !CGData.codesOpen(data.event)) return null;
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
      setGateStatus('If this is your registered email, a one-time link is on its way. Open it on this device to continue.');
    } catch (_err) {
      showError('Could not send the sign-in link. Check the address and try again in a minute.');
    }
  });

  $('email').addEventListener('input', function () { clearError(); setGateStatus(''); });
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
  }, 1000);

  renderEvent();
  if (new URLSearchParams(location.search).has('email')) {
    history.replaceState(null, '', location.pathname + location.hash);
  }
  if (!window.CGSubmission) {
    showError('Supabase sign-in is not configured yet. Contact an organiser.');
  } else {
    window.CGSubmission.ready.then(handlePortalSession).catch(function () {
      showError('Supabase could not start. Reload the page and try again.');
    });
  }
})();
