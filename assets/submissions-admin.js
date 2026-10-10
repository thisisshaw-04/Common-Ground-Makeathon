/* Organiser-only submission inbox. Access is enforced by Supabase RLS. */
(function () {
  'use strict';
  var client = window.CGSubmission && window.CGSubmission.client;
  var allRows = [];
  var $ = function (id) { return document.getElementById(id); };
  var escape = function (value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); };
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
      var links = [
        project.demo ? '<a href="' + escape(project.demo) + '" target="_blank" rel="noopener noreferrer">Demo ↗</a>' : '',
        project.source ? '<a href="' + escape(project.source) + '" target="_blank" rel="noopener noreferrer">Source ↗</a>' : ''
      ].filter(Boolean).join('');
      return '<article class="submission-card"><header><div><h2>' + escape(project.name || 'Untitled project') + '</h2>' +
        '<span class="submission-meta">' + escape(row.owner_email) + ' · ' + escape(team.name || 'No team') + '</span></div>' +
        '<span class="submission-badge ' + (row.status === 'ready' ? 'ready' : '') + '">' + escape(row.status) + '</span></header>' +
        '<p>' + escape(project.description || 'No description yet.') + '</p>' +
        '<div class="submission-meta">' + escape(members.length + 1) + ' team member(s) · Updated ' + escape(new Date(row.updated_at).toLocaleString()) + '</div>' +
        (links ? '<div class="submission-links">' + links + '</div>' : '') + '</article>';
    }).join('');
  }
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
    message('Loaded the latest submissions.');
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
