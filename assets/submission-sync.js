/* Let approved attendees edit existing project rows; do not create new submissions. */
(function () {
  'use strict';
  var EVENT_ID = 'common-ground-2026-10-11';
  var $ = function (id) { return document.getElementById(id); };
  var authBox = $('submission-auth');
  if (!authBox) return;
  var client = window.CGSubmission && window.CGSubmission.client;
  var lastUserId = null;
  var currentSubmissionRecord = null;
  var savedReflections = {designReflection:'',cultureReflection:''};
  var MEDIA_EDIT_START = Date.parse('2026-10-12T00:00:00+08:00');
  var MEDIA_EDIT_END = Date.parse('2026-10-13T00:00:00+08:00');
  var mediaClockOffset = 0;

  function participantEmail() {
    var sessionUser = window.CGSubmission && window.CGSubmission.getUser && window.CGSubmission.getUser();
    var participant = window.CGBuilderParticipant || {};
    var detailEmail = ($('p-detail').textContent.split('·')[0] || '').trim().toLowerCase();
    return String(sessionUser && sessionUser.email || participant.email || (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(detailEmail) ? detailEmail : '')).trim().toLowerCase();
  }
  function showStatus(message, isError) {
    var status = $('submission-auth-status');
    status.textContent = message;
    status.classList.toggle('error', !!isError);
  }
  function canEditExistingRecord(record) {
    return !!record && record.status === 'ready';
  }
  async function isRecognisedParticipant() {
    if (!client) return false;
    var result = await client.rpc('is_current_user_eligible');
    if (result.error) throw result.error;
    return result.data === true;
  }
  function updateSubmissionControls(record) {
    var button = $('project-ready');
    var guidance = $('submission-finalize-guidance');
    var saveButton = $('submission-form') && $('submission-form').querySelector('button[type="submit"]');
    if (!button) return;
    if (!record) {
      button.hidden = true;
      button.disabled = true;
      if (guidance) guidance.textContent = 'Only an already-saved project can be edited here. New project entries are closed.';
      if (saveButton) saveButton.textContent = 'Save image & demo links';
    } else if (record.status === 'ready') {
      button.hidden = true;
      button.disabled = true;
      if (guidance) guidance.textContent = 'This project is submitted. You can update its preview image, live demo, and demo video during the edit window.';
      if (saveButton) saveButton.textContent = 'Save project changes';
    } else {
      button.hidden = true;
      button.disabled = true;
      if (guidance) guidance.textContent = 'This draft is not published in the gallery and is locked. Only projects already submitted and visible in the gallery can update media.';
      if (saveButton) saveButton.textContent = 'Save image & demo links';
    }
    updateMediaEditAvailability();
  }
  function setEntryLock(title, message) {
    window.CGHasExistingSubmission = false;
    document.dispatchEvent(new CustomEvent('cg-existing-submission-change', {detail:{available:false}}));
    var lock = $('submission-locked');
    if (lock) {
      lock.hidden = !(window.CGBuilderEligibility === true && window.CGHasExistingSubmission === true);
      var heading = lock.querySelector('h2');
      var copy = lock.querySelector('p');
      if (heading) heading.textContent = title || 'Edit an existing project.';
      if (copy) copy.textContent = message || 'Sign in with the approved event email attached to an existing project. New project submissions are closed.';
    }
    updateSubmissionControls(null);
  }
  function setEntryUnlocked() {
    window.CGHasExistingSubmission = true;
    document.dispatchEvent(new CustomEvent('cg-existing-submission-change', {detail:{available:true}}));
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
    var wanted = String(email || '').trim().toLowerCase();
    var result = await client.from('submissions')
      .select('id,event_id,user_id,owner_email,project,team,status')
      .eq('event_id', EVENT_ID);
    if (result.error) throw result.error;
    var rows = result.data || [];
    var matches = rows.filter(function (record) {
      return String(record.owner_email || '').trim().toLowerCase() === wanted ||
        teamIncludesEmail(record.team, wanted);
    });
    var submitted = matches.filter(canEditExistingRecord);
    if (submitted.length > 1) return {record:null,ambiguous:true};
    if (submitted.length === 1) return {record:submitted[0],ambiguous:false};
    var owned = rows.find(function (record) { return record.user_id === user.id; });
    if (owned) return {record:owned,ambiguous:false};
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
  function mediaEditNow() {
    var status = window.CGEventStatus || {};
    var now = Date.now() + mediaClockOffset;
    return Number.isFinite(now) ? now : Date.now();
  }
  function isMediaEditOpen() {
    var status = window.CGEventStatus || {};
    var now = mediaEditNow();
    return !!currentSubmissionRecord &&
      now >= MEDIA_EDIT_START && now < MEDIA_EDIT_END &&
      status.submissions_closed !== true;
  }
  function updateMediaEditAvailability() {
    var inputIds = ['project-preview-file', 'project-preview-image', 'project-demo', 'project-video'];
    var form = $('submission-form');
    var helper = $('project-image-edit-deadline');
    var editLock = $('project-edit-lock');
    var saveButton = form && form.querySelector('button[type="submit"]');
    var downloadButton = $('project-download');
    var submitButton = $('project-ready');
    var canEdit = canEditExistingRecord(currentSubmissionRecord);
    var restrictedDraft = !!currentSubmissionRecord && currentSubmissionRecord.status !== 'ready';
    var open = canEdit && isMediaEditOpen();
    window.CGMediaEditOpen = open;
    if (form) {
      form.hidden = restrictedDraft;
      form.classList.toggle('media-edit-only', open);
      form.querySelectorAll('input, textarea, select').forEach(function (field) {
        var allowed = inputIds.indexOf(field.id) !== -1;
        field.disabled = !open || !allowed;
        if (allowed && field.type !== 'checkbox') {
          field.readOnly = !open;
          field.setAttribute('aria-readonly', open ? 'false' : 'true');
        }
      });
    }
    if (editLock) {
      editLock.hidden = !restrictedDraft;
      editLock.textContent = restrictedDraft
        ? 'This saved draft is not published in the gallery and cannot be edited. Only submitted projects already visible in the gallery can be changed.'
        : '';
    }
    if (saveButton) saveButton.disabled = !open;
    if (downloadButton) downloadButton.hidden = true;
    if (submitButton) {
      submitButton.hidden = true;
      submitButton.disabled = true;
    }
    if (helper) {
      var now = mediaEditNow();
      helper.textContent = now < MEDIA_EDIT_START
        ? 'Submitted gallery projects can update these links from 12:00 AM Monday, 12 October to 11:59 PM tonight, Monday, 12 October SGT.'
        : now >= MEDIA_EDIT_END || (window.CGEventStatus && window.CGEventStatus.submissions_closed)
          ? 'The edit window closed at 11:59 PM SGT Monday, 12 October. Only voting remains open through 11:59 PM Wednesday, 14 October.'
          : 'Update these links until 11:59 PM tonight, Monday, 12 October SGT. Other drafts and new projects are locked.';
    }
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
  var MAX_PREVIEW_BYTES = 5 * 1024 * 1024;
  var PREVIEW_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];
  function validatePreviewFile(file) {
    if (!file) return 'Choose an image file to upload.';
    if (PREVIEW_IMAGE_TYPES.indexOf(String(file.type || '').toLowerCase()) === -1) {
      return 'Upload a JPG, PNG, WebP, GIF, or AVIF image.';
    }
    if (file.size <= 0 || file.size > MAX_PREVIEW_BYTES) {
      return 'Choose an image smaller than 5 MB.';
    }
    return '';
  }
  async function uploadPreviewImage(submissionId, file) {
    var session = window.CGSubmission && window.CGSubmission.getSession();
    var config = window.CG_SUPABASE_CONFIG || {};
    if (!session || !session.access_token || !config.url || !config.publishableKey) {
      throw new Error('Your sign-in expired. Sign in again, then retry the upload.');
    }
    var form = new FormData();
    form.append('submissionId', submissionId);
    form.append('image', file, file.name);
    var endpoint = String(config.url).replace(/\/+$/, '') + '/functions/v1/project-preview-upload';
    var response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'apikey': config.publishableKey,
        'Authorization': 'Bearer ' + session.access_token
      },
      body: form
    });
    var data = await response.json().catch(function () { return {}; });
    if (!response.ok || !data.publicUrl) {
      throw new Error(data.error || 'The image upload failed. Try again.');
    }
    var uploadedUrl;
    try {
      uploadedUrl = new URL(data.publicUrl);
      var projectUrl = new URL(config.url);
      if (uploadedUrl.origin !== projectUrl.origin ||
          uploadedUrl.pathname.indexOf('/storage/v1/object/public/project-previews/') !== 0) {
        throw new Error();
      }
    } catch (_error) {
      throw new Error('The upload returned an invalid image link. Try again.');
    }
    return uploadedUrl.href;
  }
  async function syncDraft(status) {
    if (!isMediaEditOpen()) {
      var closedMessage = mediaEditNow() < MEDIA_EDIT_START
        ? 'Project media updates opened at 12:00 AM SGT Monday, 12 October.'
        : 'The edit window closed at 11:59 PM SGT Monday, 12 October. Only voting remains open.';
      showStatus(closedMessage, true);
      $('submission-feedback').textContent = closedMessage;
      return false;
    }
    var user = window.CGSubmission && window.CGSubmission.getUser();
    var email = participantEmail();
    if (!user || String(user.email || '').trim().toLowerCase() !== email) {
      showStatus('Sign in with your registration email to edit your existing project.', true);
      return false;
    }
    if (!(await isRecognisedParticipant())) {
      showStatus('This email is not on the participant list, so it cannot edit a project.', true);
      return false;
    }
    var lookup = await findSubmissionForUser(user, email);
    if (lookup.ambiguous) {
      setEntryLock('We could not identify one project.', 'This email is linked to more than one submitted project. Ask an organiser to check the project team emails.');
      showStatus('This email is linked to more than one submitted project. Ask an organiser to check the project team emails.', true);
      return false;
    }
    var existing = lookup.record;
    if (!existing) {
      setEntryLock('No submitted project is linked to this email.', 'Your email is recognised, but it is not listed on a submitted gallery project. Sign in with the email saved on your project or ask an organiser to correct its team email.');
      showStatus('Signed in as ' + email + '. This recognised email is not linked to a submitted project.');
      return false;
    }
    if (existing.status !== 'ready') {
      var draftLockMessage = 'This draft is not published in the gallery and cannot be edited. Only submitted gallery projects can be changed.';
      showStatus(draftLockMessage, true);
      $('submission-feedback').textContent = draftLockMessage;
      return false;
    }
    setEntryUnlocked();

    var previewWasUploaded = false;
    var previewFileInput = $('project-preview-file');
    var previewFile = previewFileInput && previewFileInput.files && previewFileInput.files[0];
    if (previewFile) {
      var fileIssue = validatePreviewFile(previewFile);
      if (fileIssue) {
        $('project-image-upload-status').textContent = fileIssue;
        showStatus(fileIssue, true);
        $('submission-feedback').textContent = fileIssue;
        return false;
      }
      showStatus('Uploading your preview image…');
      $('project-image-upload-status').textContent = 'Uploading ' + previewFile.name + '…';
      $('submission-feedback').textContent = 'Uploading the preview image, then saving your project update…';
      try {
        $('project-preview-image').value = await uploadPreviewImage(existing.id, previewFile);
        previewWasUploaded = true;
        previewFileInput.value = '';
        $('project-image-upload-status').textContent = 'Image uploaded. Saving it to this project…';
      } catch (uploadError) {
        var uploadMessage = uploadError && uploadError.message || 'The image upload failed. Try again.';
        $('project-image-upload-status').textContent = uploadMessage;
        showStatus(uploadMessage, true);
        $('submission-feedback').textContent = uploadMessage;
        return false;
      }
    }

    var project = Object.assign({}, existing.project || {});
    var mediaValues = {
      previewImage: $('project-preview-image').value.trim(),
      demo: $('project-demo').value.trim(),
      video: $('project-video').value.trim()
    };
    delete project.preview_image_url;
    delete project.preview_image;
    Object.keys(mediaValues).forEach(function (key) {
      var value = mediaValues[key];
      if (value) project[key] = value;
      else delete project[key];
    });

    var links = [
      {label:'preview image', value:mediaValues.previewImage},
      {label:'live demo', value:mediaValues.demo},
      {label:'demo video', value:mediaValues.video}
    ];
    for (var i = 0; i < links.length; i++) {
      if (!links[i].value) continue;
      try {
        if (!/^https?:$/.test(new URL(links[i].value).protocol)) throw new Error();
      } catch (_err) {
        var linkError = 'Use a complete http:// or https:// URL for the ' + links[i].label + '.';
        showStatus(linkError, true);
        $('submission-feedback').textContent = linkError;
        return false;
      }
    }

    var targetStatus = 'ready';

    var result = await client.from('submissions').update({
      status: targetStatus,
      project: project
    }).eq('id', existing.id).select('id,event_id,user_id,owner_email,project,team,status').maybeSingle();
    if (!result.error && !result.data) {
      showStatus('The saved team entry was not available to update. Reload the page and try again.', true);
      return false;
    }
    if (result.error && result.error.code === '23505') {
      showStatus('This project could not be updated because its existing team record conflicts. Contact an organiser.', true);
      return false;
    }
    if (result.error) {
      showStatus(result.error.message || 'The project update was rejected. Reload the page and try again.', true);
      $('submission-feedback').textContent = result.error.message || 'The project update was rejected. Reload the page and try again.';
      return false;
    }

    currentSubmissionRecord = Object.assign({}, existing, result.data || {}, {
      status: targetStatus,
      project: project
    });
    updateSubmissionControls(currentSubmissionRecord);
    showStatus('Project updated. It remains submitted and visible in the gallery.');
    if (previewWasUploaded) $('project-image-upload-status').textContent = 'Preview image saved to this project.';
    $('submission-feedback').textContent = 'Your submitted entry was updated.';
    return true;
  }
  function fillRemote(record) {
    currentSubmissionRecord = record;
    setEntryUnlocked();
    updateSubmissionControls(record);
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
    updateMediaEditAvailability();
    var team = record.team || {};
    var members = Array.isArray(team.members) ? team.members : [];
    $('team-contact').textContent = team.name
      ? 'Saved team: ' + team.name + ' · ' + (members.length + 1) + ' members'
      : 'Your saved team details are locked during this media update window.';
    $('submission-team').textContent = team.name
      ? 'Team: ' + team.name + ' · ' + (members.length + 1) + ' members'
      : 'Saved team details are unavailable. Contact an organiser if this is incorrect.';
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
    $('submission-feedback').textContent = record.status === 'ready'
      ? 'Your project is submitted and visible in the gallery.'
      : 'This draft is not published in the gallery and is locked. Only submitted gallery projects can be edited.';
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
      currentSubmissionRecord = null;
      setEntryLock('Sign in to vote or edit your project.', client
        ? 'Sign in with a verified email. A recognised participant email can edit only the submitted project linked to that email. Participants get 3 votes; everyone else gets 1.'
        : 'Supabase is not configured on this site yet.');
      showStatus(client ? 'Sign in with the email linked to your submitted project to edit it. Everyone can sign in to vote.' : 'Supabase is not configured on this site yet.', !client);
      return;
    }
    try {
      if (window.CGEventStatus && window.CGEventStatus.submissions_closed) {
        currentSubmissionRecord = null;
        setEntryLock('Project edits are closed.', 'Submissions have been closed by the event schedule or an organiser. The public gallery remains open.');
        showStatus('Submissions are closed by the event schedule or an organiser. The public gallery remains open.');
        return;
      }
      if (lastUserId !== user.id) {
        lastUserId = user.id;
        var recognised = await isRecognisedParticipant();
        if (!recognised) {
          currentSubmissionRecord = null;
          setEntryLock('You’re signed in to vote.', 'This email is not on the participant list, so it gets one vote after voting opens at 6:00 PM SGT. Project edits are limited to recognised participant emails linked to their own submitted project.');
          showStatus('Signed in as ' + signedInEmail + '. You can cast one vote after 6:00 PM SGT.');
          return;
        }
        var lookup = await findSubmissionForUser(user, signedInEmail);
        if (lookup.ambiguous) {
          currentSubmissionRecord = null;
          setEntryLock('We could not identify one project.', 'This email is linked to more than one submitted project. Ask an organiser to check the project team emails.');
          showStatus('This email is linked to more than one submitted project. Ask an organiser to check the project team emails.', true);
          return;
        }
        if (lookup.record) {
          fillRemote(lookup.record);
          showStatus('Signed in as ' + signedInEmail + '. You can edit the submitted project linked to this email during the edit window.');
        } else {
          currentSubmissionRecord = null;
          setEntryLock('No submitted project is linked to this email.', 'Your email is recognised, but it is not listed on a submitted gallery project. Sign in with the email saved on your project or ask an organiser to correct its team email. You can still vote after 6:00 PM SGT.');
          showStatus('Signed in as ' + signedInEmail + '. This participant email is recognised, but no submitted project is linked to it.');
        }
      } else if (currentSubmissionRecord) {
        setEntryUnlocked();
        updateSubmissionControls(currentSubmissionRecord);
      }
    } catch (_err) {
      currentSubmissionRecord = null;
      setEntryLock('Could not verify your project.', 'Reload the page and try again. If the problem continues, ask an organiser for help.');
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
  $('project-preview-file').addEventListener('change', function () {
    var file = this.files && this.files[0];
    var status = $('project-image-upload-status');
    if (!file) {
      status.textContent = 'Leave this empty to keep the current preview image.';
      return;
    }
    var issue = validatePreviewFile(file);
    if (issue) {
      this.value = '';
      status.textContent = issue;
      showStatus(issue, true);
      return;
    }
    status.textContent = file.name + ' selected. Save project changes to upload it.';
  });
  updateSubmissionGuidance();
  updateMediaEditAvailability();
  document.addEventListener('cg-project-draft-loaded', function () {
    updateSubmissionGuidance();
    updateMediaEditAvailability();
  });
  document.addEventListener('cg-event-status', function (event) {
    var status = event.detail || {};
    if (status.authoritative && status.current_at) {
      var serverTime = Date.parse(status.current_at);
      if (Number.isFinite(serverTime)) mediaClockOffset = serverTime - Date.now();
    }
    updateMediaEditAvailability();
    var session = window.CGSubmission && window.CGSubmission.getSession();
    if (session && session.user) syncAuth(session);
  });

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
      readyButton.removeAttribute('aria-busy');
      updateSubmissionControls(currentSubmissionRecord);
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
