/* Common Ground — front portal (builder-facing).
   Renders event content from CGData and looks up a token by email. */
(function () {
  'use strict';

  var data = CGData.load();
  var current = null;

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

  /* ---------------- token lookup ---------------- */
  function showError(msg) {
    var el = $('gate-error');
    el.innerHTML = msg;
    el.classList.add('visible');
    $('result').classList.remove('visible');
  }

  function clearError() {
    $('gate-error').classList.remove('visible');
  }

  function renderResult(p) {
    current = p;
    window.CGBuilderParticipant = p;
    document.dispatchEvent(new CustomEvent('cg-builder-participant', { detail: { participant: p } }));
    clearError();

    $('p-name').textContent = p.name || p.email;
    $('p-detail').textContent = [p.email, p.team, p.ticket].filter(Boolean).join('  ·  ');

    var status = $('p-status');
    status.textContent = String(p.status || '').toUpperCase();
    status.className = 'badge ' + (p.status === 'confirmed' ? 'ok' : 'warn');

    var open = p.status === 'confirmed' && CGData.codesOpen(data.event);
    $('p-token').textContent = open ? (p.token || '—') : 'Not available yet';
    $('token-copy').hidden = !open || !p.token || p.token === '—';
    $('release-notice').textContent = p.status === 'confirmed' && !open ? 'Your place is confirmed. Tokens and tool codes unlock on ' + CGData.releaseLabel(data.event) + '.' : '';
    $('release-notice').hidden = !$('release-notice').textContent;
    var ready = open && p.token && p.token !== '—' && (data.perks || []).every(function (perk) { return (perk.id === 'codex' || perk.id === 'openai' || perk.id === 'figma' || perk.id === 'mobbin') || (p.codes && p.codes[perk.id]); });
    $('team-section').hidden = !ready;
    $('submission-section').hidden = !ready;
    if (ready) { loadTeam(p); loadProject(p); }

    if (p.status !== 'confirmed') {
      $('perks').innerHTML =
        '<div class="perk"><div class="perk-head"><h3>Nothing to redeem yet</h3></div>' +
        '<p>Your place is not confirmed, so no tool credits have been issued. As soon as a spot opens we email you, ' +
        'and this page fills in on its own.</p>' +
        '<p class="perk-steps" style="padding-left:0">STATUS · ' + esc(String(p.status || 'pending').toUpperCase()) + '</p></div>';
    } else {
      $('perks').innerHTML = (data.perks || []).map(function (perk) {
        var hasClaimPool = perk.id === 'codex' || perk.id === 'openai' || perk.id === 'figma' || perk.id === 'mobbin';
        var code = open && !hasClaimPool ? ((p.codes && p.codes[perk.id]) || '') : '';
        var claimed = !hasClaimPool && !!(p.claimed && p.claimed[perk.id]);
        var steps = (perk.steps || []).map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
        return '<article class="perk' + (claimed ? ' claimed' : '') + '">' +
          '<div class="perk-head"><div><h3>' + esc(perk.name) + '</h3>' +
            '<div class="perk-kind">' + esc(perk.kind) + '</div></div>' +
            '<span class="perk-value">' + esc(perk.value) + '</span></div>' +
          '<p>' + esc(perk.blurb) + '</p>' +
          '<div class="perk-code">' +
            '<code id="code-' + esc(perk.id) + '">' + esc(open ? (hasClaimPool ? 'CLAIM BELOW · FIRST COME, FIRST SERVED' : (code || 'NOT ISSUED')) : 'AVAILABLE ' + CGData.releaseLabel(data.event)) + '</code>' +
            (code ? '<button class="copy-btn btn-sm" type="button" data-copy-target="code-' + esc(perk.id) + '">Copy</button>' : '') +
          '</div>' +
          '<ol class="perk-steps">' + steps + '</ol>' +
          '<div class="perk-foot">' +
            '<span class="perk-window">' + (open && claimed ? '<span class="claim-tag">✓ ALREADY REDEEMED</span>' : esc(open ? perk.window : 'Opens on release day')) + '</span>' +
            (open && code ? '<a class="redeem" href="' + esc(perk.redeemUrl) + '" target="_blank" rel="noopener noreferrer">Redeem <span aria-hidden="true">↗</span></a>' : '') +
          '</div></article>';
      }).join('');
    }

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
  var projectFields = ['name', 'description', 'demo', 'source'];
  function updateProjectTeam() {
    var team = null;
    try { team = JSON.parse(localStorage.getItem(teamKey(current))); } catch (err) { /* No saved team. */ }
    $('submission-team').textContent = team ? 'Team: ' + team.name + ' · ' + (team.members.length + 1) + ' members (including you)' : 'Save your team details above before marking your project ready.';
    return team;
  }
  function loadProject(p) {
    var saved = null;
    try { saved = projectStore.load(p); } catch (err) { /* An unreadable draft remains untouched until saved. */ }
    projectFields.forEach(function (key) { $('project-' + key).value = saved && saved.project && saved.project[key] || ''; });
    updateProjectTeam();
    $('submission-feedback').textContent = saved ? (saved.status === 'ready' ? 'Marked ready locally. Not sent to organisers.' : 'Saved project draft loaded.') : 'No project draft saved yet.';
  }
  function saveProject(ready) {
    if (!current || $('submission-section').hidden || !CGData.codesOpen(data.event)) return null;
    var project = {};
    projectFields.forEach(function (key) { project[key] = $('project-' + key).value.trim(); });
    var team = updateProjectTeam();
    var error = '';
    ['demo', 'source'].forEach(function (key) {
      if (!project[key]) return;
      try { if (!/^https?:$/.test(new URL(project[key]).protocol)) throw Error(); }
      catch (err) { error = 'Use a complete http:// or https:// URL for your project links.'; }
    });
    if (ready && (!project.name || !project.description)) error = 'Add a project name and description before marking ready.';
    if (ready && !project.demo && !project.source) error = 'Add a demo or source link before marking ready.';
    if (ready && !team) error = 'Save your team details above first.';
    if (error) { $('submission-feedback').textContent = error; return null; }
    var record = {schemaVersion:1, eventId:'common-ground-2026-10-11', ownerEmail:current.email.trim().toLowerCase(), status:ready ? 'ready' : 'draft', project:project, team:team, updatedAt:new Date().toISOString()};
    try { projectStore.save(current, record); }
    catch (err) { $('submission-feedback').textContent = 'Could not save. Allow browser storage and try again.'; return null; }
    $('submission-feedback').textContent = ready ? 'Marked ready locally. Your project has not been sent to organisers.' : 'Project draft saved on this device. You can come back to finish it.';
    return record;
  }
  $('submission-form').addEventListener('submit', function (ev) { ev.preventDefault(); saveProject(false); });
  $('submission-form').addEventListener('input', function () { $('submission-feedback').textContent = 'Unsaved changes. Save your draft to keep these edits.'; });
  $('project-ready').addEventListener('click', function () { saveProject(true); });
  $('project-download').addEventListener('click', function () {
    var record = saveProject(false);
    if (!record) return;
    var url = URL.createObjectURL(new Blob([JSON.stringify(record, null, 2)], {type:'application/json'}));
    var link = document.createElement('a'); link.href = url; link.download = 'common-ground-project-draft.json'; link.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  });

  $('gate-form').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var value = $('email').value.trim();

    if (!value) { showError('Enter the email address you signed up with.'); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
      showError('That does not look like an email address. Check for a typo.');
      return;
    }

    var person = CGData.findByEmail(data, value);
    if (!person) {
      showError('We cannot find <b>' + esc(value) + '</b> on the list. ' +
        'Sign-ups are matched on the exact address from your confirmation email — ' +
        'try another address, or find us at the front desk.');
      return;
    }
    renderResult(person);
  });

  $('email').addEventListener('input', clearError);

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
    if (current) {
      var again = CGData.findByEmail(data, current.email);
      if (again) renderResult(again); else $('result').classList.remove('visible');
    }
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

  /* Deep link: index.html?email=ada@example.com */
  renderEvent();
  var qs = new URLSearchParams(location.search).get('email');
  if (qs) { $('email').value = qs; $('gate-form').dispatchEvent(new Event('submit')); }
})();
