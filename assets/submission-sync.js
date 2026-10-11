/* Sync the existing local builder drafts to Supabase after email verification. */
(function () {
  'use strict';
  var EVENT_ID = 'common-ground-2026-10-11';
  var $ = function (id) { return document.getElementById(id); };
  var authBox = $('submission-auth');
  if (!authBox) return;
  var client = window.CGSubmission && window.CGSubmission.client;
  var lastUserId = null;
  var savedReflections = {designReflection:'',cultureReflection:''};
  var PREVIEW_IMAGE_CUTOFF = Date.parse('2026-10-13T18:00:00+08:00');

  function participantEmail() {
    var participant = window.CGBuilderParticipant || {};
    var detailEmail = ($('p-detail').textContent.split('·')[0] || '').trim().toLowerCase();
    return String(participant.email || (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(detailEmail) ? detailEmail : '')).trim().toLowerCase();
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
  function formTeam(email, existingTeam) {
    var participant = window.CGBuilderParticipant || {};
    var existingContact = existingTeam && existingTeam.contact || {};
    var contactEmail = String(existingContact.email || email).trim().toLowerCase();
    var contactName = String(existingContact.name || participant.name || '').trim();
    var members = [];
    var seen = [];
    var issue = '';
    document.querySelectorAll('.team-member').forEach(function (row) {
      var name = row.querySelector('.member-name').value.trim();
      var memberEmail = row.querySelector('.member-email').value.trim().toLowerCase();
      if (!name && !memberEmail) return;
      if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(memberEmail)) {
        issue = 'Enter a name and valid email for each teammate.';
        return;
      }
      if (memberEmail === contactEmail) return;
      if (seen.indexOf(memberEmail) !== -1) {
        issue = 'Each email must be unique. You are already included as the team contact.';
        return;
      }
      seen.push(memberEmail);
      members.push({name:name,email:memberEmail});
    });
    return {
      team:{name:$('team-name').value.trim(),contact:{name:contactName,email:contactEmail},members:members},
      issue:issue
    };
  }
  function teamIncludesEmail(team, email) {
    var wanted = String(email || '').trim().toLowerCase();
    if (!wanted || !team) return false;
    var contact = team.contact || {};
    if (String(contact.email || '').trim().toLowerCase() === wanted) return true;
    return Array.isArray(team.members) && team.members.some(function (member) {
      return String(member && member.email || '').trim().toLowerCase() === wanted;
    });
  }
  async function findSubmissionForUser(user, email) {
    var result = await client.from('submissions')
      .select('id,event_id,user_id,owner_email,project,team,status')
      .eq('event_id', EVENT_ID);
    if (result.error) throw result.error;
    var rows = result.data || [];
    var owned = rows.find(function (record) { return record.user_id === user.id; });
    if (owned) return {record:owned,ambiguous:false};
    var matches = rows.filter(function (record) { return teamIncludesEmail(record.team, email); });
    return {record:matches.length === 1 ? matches[0] : null,ambiguous:matches.length > 1};
  }
  function selectedTracks() {
    return Array.prototype.slice.call(document.querySelectorAll('input[name="project-track"]:checked')).map(function (input) { return input.value; });
  }
  function formProject() {
    var overview = $('project-overview').value.trim();
    var build = $('project-build').value.trim();
    return {
      name: $('project-name').value.trim(),
      tracks: selectedTracks(),
      overview: overview,
      build: build,
      /* Keep the original gallery RPC compatible until older projects age out. */
      oneLiner: overview,
      inspiration: overview,
      solution: '',
      interesting: '',
      technology: build,
      made: '',
      experiment: '',
      next: '',
      previewImage: $('project-preview-image').value.trim(),
      demo: $('project-demo').value.trim(),
      video: $('project-video').value.trim(),
      source: $('project-source').value.trim(),
      prototype: $('project-prototype').value.trim(),
      noCode: $('project-no-code').checked,
      supporting: $('project-supporting').value.trim(),
      designReflection: savedReflections.designReflection,
      cultureReflection: savedReflections.cultureReflection,
      collaboration: $('project-collaboration').value.trim(),
      attribution: $('project-attribution').value.trim()
    };
  }
  function wordCount(values) {
    var text = values.filter(Boolean).join(' ').trim();
    return text ? text.split(/\s+/).length : 0;
  }
  function updateSubmissionGuidance() {
    var overview = wordCount([$('project-overview').value.trim()]);
    var build = wordCount([$('project-build').value.trim()]);
    var tracks = selectedTracks();
    $('overview-count').textContent = overview + ' / 100 words';
    $('build-count').textContent = build + ' / 100 words';
    $('track-count').textContent = tracks.length + ' of 2 selected';
  }
  function updatePreviewImageAvailability() {
    var input = $('project-preview-image');
    var helper = $('project-image-edit-deadline');
    if (!input || !helper) return;
    var closed = Date.now() >= PREVIEW_IMAGE_CUTOFF;
    input.readOnly = closed;
    input.setAttribute('aria-readonly', closed ? 'true' : 'false');
    helper.textContent = closed
      ? 'Image updates closed at 6:00 PM SGT Tuesday, 13 October.'
      : 'Paste a direct image URL. You can change it until 6:00 PM SGT Tuesday, 13 October.';
  }
  function validateReady(project, team) {
    if (!project.name || !project.overview || !project.build ||
        !project.collaboration || !project.attribution || !team || !team.name) return 'Complete the required project and team fields before submitting.';
    if (!project.tracks.length || project.tracks.length > 2) return 'Choose one or two award tracks.';
    if (!project.video) return 'Add a demo video link (2 minutes or less) before submitting.';
    if (wordCount([project.overview]) > 100) return 'Keep the Project Overview within 100 words.';
    if (wordCount([project.build]) > 100) return 'Keep The Build within 100 words.';
    var links = [project.demo, project.video, project.source, project.prototype].filter(Boolean);
    for (var i = 0; i < links.length; i++) {
      try { if (!/^https?:$/.test(new URL(links[i]).protocol)) throw new Error(); }
      catch (_err) { return 'Use complete http:// or https:// URLs for project links.'; }
    }
    return '';
  }
  async function checkEligibility(user) {
    if (!client || !user) return false;
    var result = await client.rpc('is_current_user_eligible');
    if (result.error) throw result.error;
    return result.data === true;
  }
  async function syncDraft(status) {
    if (window.CGEventStatus && window.CGEventStatus.submissions_closed) {
      showStatus('Submissions are closed by the event schedule or an organiser. The public gallery remains open.', true);
      return false;
    }
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
    var lookup = await findSubmissionForUser(user, email);
    if (lookup.ambiguous) {
      showStatus('This email appears on more than one team entry. Ask an organiser to correct the team list.', true);
      return false;
    }
    var existing = lookup.record;
    var teamResult = formTeam(email, existing && existing.team);
    var team = teamResult.team;
    var project = formProject();
    if (project.previewImage) {
      try {
        if (!/^https?:$/.test(new URL(project.previewImage).protocol)) throw new Error();
      } catch (_err) {
        showStatus('Use a complete http:// or https:// image URL.', true);
        $('submission-feedback').textContent = 'Use a complete http:// or https:// image URL.';
        return false;
      }
    }
    if (status === 'ready') {
      if (teamResult.issue) {
        showStatus(teamResult.issue, true);
        $('submission-feedback').textContent = teamResult.issue;
        return false;
      }
      var issue = validateReady(project, team);
      if (issue) {
        showStatus(issue, true);
        $('submission-feedback').textContent = issue;
        return false;
      }
      try { localStorage.setItem('cg-team-draft-v1:' + email, JSON.stringify(team)); } catch (_err) { /* The central submission remains authoritative. */ }
    }
    var result;
    if (existing) {
      result = await client.from('submissions').update({
        status: status,
        project: project,
        team: team,
        updated_at: new Date().toISOString()
      }).eq('id', existing.id).select('id').maybeSingle();
      if (!result.error && !result.data) {
        showStatus('The saved team entry was not available to update. Reload the page and try again.', true);
        return false;
      }
    } else {
      result = await client.from('submissions').upsert({
        event_id: EVENT_ID,
        user_id: user.id,
        owner_email: email,
        status: status,
        project: project,
        team: team,
        updated_at: new Date().toISOString()
      }, { onConflict: 'event_id,user_id' });
    }
    if (result.error && result.error.code === '23505') {
      showStatus('A project with this team name already exists. Sign in with an email listed on that team entry to update it.', true);
      return false;
    }
    if (result.error) throw result.error;
    showStatus(status === 'ready' ? 'Submitted. Organisers can see your entry now; it appears in the public gallery from 3:15 PM SGT.' : 'Draft saved centrally for the organisers.');
    $('submission-feedback').textContent = status === 'ready' ? 'Your final entry is saved for the organisers.' : 'Draft saved centrally. You can return to edit it.';
    return true;
  }
  function fillRemote(record) {
    var project = record.project || {};
    savedReflections = {
      designReflection: project.designReflection || '',
      cultureReflection: project.cultureReflection || ''
    };
    var values = {
      name: project.name || '',
      previewImage: project.previewImage || project.preview_image_url || project.preview_image || '',
      overview: project.overview || [project.oneLiner, project.inspiration, project.solution, project.interesting].filter(Boolean).join('\n\n'),
      build: project.build || [project.technology, project.made, project.experiment, project.next].filter(Boolean).join('\n\n'),
      demo: project.demo || '',
      video: project.video || '',
      source: project.source || '',
      prototype: project.prototype || '',
      supporting: project.supporting || '',
      designReflection: project.designReflection || '',
      cultureReflection: project.cultureReflection || '',
      collaboration: project.collaboration || '',
      attribution: project.attribution || ''
    };
    Object.keys(values).forEach(function (key) {
      var input = $('project-' + key.replace(/[A-Z]/g, function (letter) { return '-' + letter.toLowerCase(); }));
      if (input) input.value = values[key];
    });
    $('project-no-code').checked = !!project.noCode;
    document.querySelectorAll('input[name="project-track"]').forEach(function (input) { input.checked = Array.isArray(project.tracks) && project.tracks.indexOf(input.value) !== -1; });
    updateSubmissionGuidance();
    updatePreviewImageAvailability();
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
    var signedInEmail = String(user && user.email || '').trim().toLowerCase();
    $('submission-auth-form').hidden = !!user;
    $('submission-auth-identity').hidden = !user;
    $('submission-auth-email-display').value = user ? signedInEmail : '';
    $('submission-signout').hidden = !user;
    $('submission-auth-email').value = wanted;
    if (!user) {
      lastUserId = null;
      showStatus(client ? 'Sign in with your registration email. Organisers only see submissions after you save them.' : 'Supabase is not configured on this site yet.', !client);
      return;
    }
    if (signedInEmail !== wanted) {
      showStatus('Signed in as ' + signedInEmail + '. Sign out and use your registration email (' + wanted + ').', true);
      return;
    }
    try {
      if (!(await checkEligibility(user))) {
        showStatus('This email is not on the builder list enabled for submissions. Contact an organiser.', true);
        return;
      }
      if (window.CGEventStatus && window.CGEventStatus.submissions_closed) {
        showStatus('Submissions are closed by the event schedule or an organiser. The public gallery remains open.');
        return;
      }
      showStatus('Signed in as ' + signedInEmail + '. Save a draft or submit while submissions are open.');
      if (lastUserId !== user.id) {
        lastUserId = user.id;
        var lookup = await findSubmissionForUser(user, signedInEmail);
        if (lookup.ambiguous) {
          showStatus('This email appears on more than one team entry. Ask an organiser to correct the team list.', true);
          return;
        }
        if (lookup.record) fillRemote(lookup.record);
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

  document.querySelectorAll('input[name="project-track"]').forEach(function (input) {
    input.addEventListener('change', function () {
      var checked = document.querySelectorAll('input[name="project-track"]:checked');
      if (checked.length > 2) input.checked = false;
      updateSubmissionGuidance();
    });
  });
  ['project-overview','project-build'].forEach(function (id) {
    $(id).addEventListener('input', updateSubmissionGuidance);
  });
  updateSubmissionGuidance();
  updatePreviewImageAvailability();
  document.addEventListener('cg-project-draft-loaded', function () {
    updateSubmissionGuidance();
    updatePreviewImageAvailability();
  });
  var previewImageDelay = PREVIEW_IMAGE_CUTOFF - Date.now();
  if (previewImageDelay > 0) window.setTimeout(updatePreviewImageAvailability, previewImageDelay + 100);

  $('submission-auth-form').addEventListener('submit', async function (event) {
    event.preventDefault();
    var email = $('submission-auth-email').value.trim().toLowerCase();
    if (!email || email !== participantEmail()) {
      showStatus('Use the same email address you used to find your builder token.', true);
      return;
    }
    try {
      await window.CGSubmission.signIn(email);
      showStatus('Check your inbox and spam folder. Open the newest link in this browser to return to your project.');
    } catch (_err) {
      showStatus(window.CGSubmission.signInErrorMessage(_err), true);
    }
  });
  $('submission-signout').addEventListener('click', async function () {
    try { await window.CGSubmission.signOut(); }
    catch (_err) { showStatus('Could not sign out. Reload the page and try again.', true); }
  });

  var draftBusy = false;
  async function handleDraftSubmit(event) {
    event.preventDefault();
    if (draftBusy) return;
    draftBusy = true;
    var button = event.submitter;
    if (button) button.disabled = true;
    try { await syncDraft('draft'); }
    catch (_err) { showStatus('Could not save centrally. Check your sign-in and try again.', true); }
    finally {
      draftBusy = false;
      if (button) button.disabled = false;
    }
  }
  $('team-form').addEventListener('submit', handleDraftSubmit);
  $('submission-form').addEventListener('submit', handleDraftSubmit);
  var readyButton = $('project-ready');
  var readyBusy = false;
  readyButton.addEventListener('click', async function () {
    if (readyBusy) return;
    readyBusy = true;
    readyButton.disabled = true;
    readyButton.setAttribute('aria-busy', 'true');
    readyButton.textContent = 'Submitting…';
    $('submission-feedback').textContent = 'Sending your final entry to the organisers…';
    try {
      await syncDraft('ready');
    } catch (_err) {
      showStatus('Could not submit right now. Your draft remains saved on this device. Please try again.', true);
      $('submission-feedback').textContent = 'Could not submit. Your draft remains saved on this device; try again.';
    } finally {
      readyBusy = false;
      readyButton.disabled = false;
      readyButton.removeAttribute('aria-busy');
      readyButton.textContent = 'Submit final entry';
    }
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
