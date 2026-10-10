/* Sync the existing local builder drafts to Supabase after email verification. */
(function () {
  'use strict';
  var EVENT_ID = 'common-ground-2026-10-11';
  var $ = function (id) { return document.getElementById(id); };
  var authBox = $('submission-auth');
  if (!authBox) return;
  var client = window.CGSubmission && window.CGSubmission.client;
  var lastUserId = null;

  function participantEmail() {
    return ($('p-detail').textContent.split('·')[0] || '').trim().toLowerCase();
  }
  function showStatus(message, isError) {
    var status = $('submission-auth-status');
    status.textContent = message;
    status.classList.toggle('error', !!isError);
  }
  function readTeam(email) {
    try { return JSON.parse(localStorage.getItem('cg-team-draft-v1:' + email) || 'null'); }
    catch (_err) { return null; }
  }
  function readProject(email) {
    try { return JSON.parse(localStorage.getItem('cg-project-draft-v1:' + email) || 'null'); }
    catch (_err) { return null; }
  }
  function formProject() {
    return {
      name: $('project-name').value.trim(),
      description: $('project-description').value.trim(),
      demo: $('project-demo').value.trim(),
      source: $('project-source').value.trim()
    };
  }
  function isReady(project, team) {
    return !!(project.name && project.description && (project.demo || project.source) && team && team.name);
  }
  async function checkEligibility(user) {
    if (!client || !user) return false;
    var result = await client.rpc('is_current_user_eligible');
    if (result.error) throw result.error;
    return result.data === true;
  }
  async function syncDraft(status) {
    var user = window.CGSubmission && window.CGSubmission.getUser();
    var email = participantEmail();
    if (!user || String(user.email || '').trim().toLowerCase() !== email) {
      showStatus('Sign in with your registration email to save this centrally. Your local draft remains on this device.', true);
      return false;
    }
    var eligible = await checkEligibility(user);
    if (!eligible) {
      showStatus('This email is not on the builder list enabled for submissions. Contact an organiser.', true);
      return false;
    }
    var savedTeam = readTeam(email);
    var team = savedTeam || { name: $('team-name').value.trim(), members: [] };
    var project = formProject();
    if (status === 'ready' && !savedTeam) {
      showStatus('Save your team draft before marking the project ready.', true);
      return false;
    }
    if (status === 'ready' && !isReady(project, team)) {
      showStatus('To mark ready, save your team, project name, description, and at least one https:// link first.', true);
      return false;
    }
    var result = await client.from('submissions').upsert({
      event_id: EVENT_ID,
      user_id: user.id,
      owner_email: email,
      status: status,
      project: project,
      team: team,
      updated_at: new Date().toISOString()
    }, { onConflict: 'event_id,user_id' });
    if (result.error) throw result.error;
    showStatus(status === 'ready' ? 'Submission marked ready and saved for the organisers.' : 'Draft saved centrally for the organisers.');
    $('submission-feedback').textContent = status === 'ready' ? 'Submission saved centrally and marked ready.' : 'Draft saved centrally. You can return to edit it.';
    return true;
  }
  function fillRemote(record) {
    var project = record.project || {};
    ['name', 'description', 'demo', 'source'].forEach(function (key) {
      $('project-' + key).value = project[key] || '';
    });
    var team = record.team || {};
    if (team.name) {
      $('team-name').value = team.name;
      var email = participantEmail();
      try { localStorage.setItem('cg-team-draft-v1:' + email, JSON.stringify(team)); } catch (_err) { /* Remote copy stays safe. */ }
      var membersNode = $('team-members');
      membersNode.innerHTML = '';
      (Array.isArray(team.members) ? team.members : []).forEach(function (member, index) {
        var fieldset = document.createElement('fieldset');
        fieldset.className = 'team-member';
        var legend = document.createElement('legend');
        legend.textContent = 'Teammate';
        var row = document.createElement('div');
        row.className = 'field-row';
        [['NAME', 'member-name', 'text', member.name], ['EMAIL', 'member-email', 'email', member.email]].forEach(function (field) {
          var label = document.createElement('label');
          label.className = 'field';
          var caption = document.createElement('span');
          caption.textContent = field[0];
          var input = document.createElement('input');
          input.className = field[1];
          input.type = field[2];
          input.required = true;
          input.maxLength = 254;
          input.value = field[3] || '';
          label.appendChild(caption); label.appendChild(input); row.appendChild(label);
        });
        var remove = document.createElement('button');
        remove.type = 'button'; remove.className = 'btn btn-sm remove-member';
        remove.setAttribute('aria-label', 'Remove teammate ' + (index + 1));
        remove.textContent = 'Remove teammate';
        fieldset.appendChild(legend); fieldset.appendChild(row); fieldset.appendChild(remove);
        membersNode.appendChild(fieldset);
      });
    }
    $('submission-feedback').textContent = record.status === 'ready' ? 'Your central submission is marked ready. You can still edit and save it.' : 'Your central draft is loaded.';
  }
  async function syncAuth(session) {
    var user = session && session.user;
    var wanted = participantEmail();
    $('submission-auth-form').hidden = !!user;
    $('submission-signout').hidden = !user;
    $('submission-auth-email').value = wanted;
    if (!user) {
      lastUserId = null;
      showStatus(client ? 'Sign in with your registration email. Organisers only see submissions after you save them.' : 'Supabase is not configured on this site yet.', !client);
      return;
    }
    var signedInEmail = String(user.email || '').trim().toLowerCase();
    if (signedInEmail !== wanted) {
      showStatus('Signed in as ' + signedInEmail + '. Sign out and use your registration email (' + wanted + ').', true);
      return;
    }
    try {
      if (!(await checkEligibility(user))) {
        showStatus('This email is not on the builder list enabled for submissions. Contact an organiser.', true);
        return;
      }
      showStatus('Signed in as ' + signedInEmail + '. Your submission saves to the organiser inbox when you press Save.');
      if (lastUserId !== user.id) {
        lastUserId = user.id;
        var result = await client.from('submissions').select('project,team,status').eq('event_id', EVENT_ID).eq('user_id', user.id).maybeSingle();
        if (result.error) throw result.error;
        if (result.data) fillRemote(result.data);
        else {
          var local = readProject(wanted);
          var team = readTeam(wanted);
          if (local && local.project) fillRemote({ project: local.project, team: team || local.team || {}, status: local.status || 'draft' });
        }
      }
    } catch (err) {
      showStatus('Could not check submission access. Ask an organiser to finish the Supabase setup, then reload.', true);
    }
  }

  $('submission-auth-form').addEventListener('submit', async function (event) {
    event.preventDefault();
    var email = $('submission-auth-email').value.trim().toLowerCase();
    if (!email || email !== participantEmail()) {
      showStatus('Use the same email address you used to find your builder token.', true);
      return;
    }
    try {
      await window.CGSubmission.signIn(email);
      showStatus('Check your email for a one-time sign-in link. Return here after opening it.');
    } catch (_err) {
      showStatus('Could not send the sign-in link. Check the email and try again.', true);
    }
  });
  $('submission-signout').addEventListener('click', async function () {
    try { await window.CGSubmission.signOut(); }
    catch (_err) { showStatus('Could not sign out. Reload the page and try again.', true); }
  });

  $('team-form').addEventListener('submit', function () {
    window.setTimeout(function () { syncDraft('draft').catch(function () { showStatus('Could not save centrally. Check the Supabase setup and try again.', true); }); }, 0);
  });
  $('submission-form').addEventListener('submit', function () {
    window.setTimeout(function () { syncDraft('draft').catch(function () { showStatus('Could not save centrally. Check the Supabase setup and try again.', true); }); }, 0);
  });
  $('project-ready').addEventListener('click', function () {
    window.setTimeout(function () { syncDraft('ready').catch(function () { showStatus('Could not mark ready centrally. Check the Supabase setup and try again.', true); }); }, 0);
  });

  document.addEventListener('cg-submission-auth', function (event) { syncAuth(event.detail && event.detail.session); });
  var detailObserver = new MutationObserver(function () {
    if (window.CGSubmission) syncAuth(window.CGSubmission.getSession());
  });
  detailObserver.observe($('p-detail'), { childList: true, characterData: true, subtree: true });
  if (!client) {
    syncAuth(null);
    return;
  }
  window.CGSubmission.ready.then(function (session) { syncAuth(session); })
    .catch(function () { showStatus('Supabase could not start. Reload the page and try again.', true); });
})();
