/* Authenticated, first-come-first-served tool code claims. */
(function () {
  'use strict';
  var tools = ['openai', 'figma', 'mobbin'];
  var $ = function (id) { return document.getElementById(id); };
  var participant = null;
  var session = null;
  var claimed = {};
  var section = $('tool-code-claims');
  if (!section) return;

  function participantEmail() {
    return String(participant && participant.email || '').trim().toLowerCase();
  }
  function codesAreOpen() {
    var data = window.CGData && window.CGData.load();
    return !!(data && data.event && window.CGData.codesOpen(data.event));
  }
  function showValue(tool, value) {
    claimed[tool] = value;
    var output = $('tool-claim-output-' + tool);
    var anchor = $('tool-claim-link-' + tool);
    var text = $('tool-claim-value-' + tool);
    var parsed = null;
    try { parsed = new URL(value); } catch (_err) { /* Promotional codes can be plain text. */ }
    if (parsed && parsed.protocol === 'https:') {
      anchor.href = parsed.href;
      anchor.hidden = false;
      text.hidden = true;
    } else {
      anchor.hidden = true;
      text.textContent = value;
      text.hidden = false;
    }
    output.hidden = false;
    $('tool-claim-status-' + tool).textContent = 'Reserved for your signed-in account.';
  }
  function update() {
    var eligiblePage = !!(participant && participant.status === 'confirmed' && codesAreOpen());
    section.hidden = !eligiblePage;
    if (!eligiblePage) return;
    var email = String(session && session.user && session.user.email || '').trim().toLowerCase();
    var matches = !!email && email === participantEmail();
    var client = window.CGSubmission && window.CGSubmission.client;
    $('tool-claim-login').hidden = !!email;
    $('tool-claim-signout').hidden = !email;
    $('tool-claim-auth-status').textContent = '';
    if (!client) {
      $('tool-claim-login').hidden = true;
      $('tool-claim-auth-status').textContent = 'Supabase sign-in is not configured yet.';
    } else if (!email) {
      $('tool-claim-login').hidden = false;
      $('tool-claim-email').value = participantEmail();
      $('tool-claim-auth-status').textContent = 'Sign in with your approved registration email. Each offer is limited to the first 100 approved builders who claim.';
    } else if (!matches) {
      $('tool-claim-auth-status').textContent = 'You are signed in with a different email. Sign out, then use the approved builder email shown above.';
    } else {
      $('tool-claim-auth-status').textContent = 'One claim per approved email for each tool. Repeat requests return your existing claim.';
    }
    tools.forEach(function (tool) {
      var button = document.querySelector('[data-tool-claim="' + tool + '"]');
      button.hidden = !matches;
      $('tool-claim-status-' + tool).textContent = '';
      $('tool-claim-output-' + tool).hidden = !claimed[tool];
      if (claimed[tool]) showValue(tool, claimed[tool]);
    });
  }
  function setParticipant(next) {
    var oldEmail = participantEmail();
    participant = next || null;
    if (participantEmail() !== oldEmail) {
      claimed = {};
      tools.forEach(function (tool) {
        $('tool-claim-output-' + tool).hidden = true;
        $('tool-claim-link-' + tool).hidden = true;
        $('tool-claim-value-' + tool).hidden = true;
      });
    }
    update();
  }
  $('tool-claim-login').addEventListener('submit', async function (event) {
    event.preventDefault();
    var email = String($('tool-claim-email').value || '').trim().toLowerCase();
    if (!participant || email !== participantEmail()) {
      $('tool-claim-auth-status').textContent = 'Use the approved registration email shown above.';
      return;
    }
    try {
      await window.CGSubmission.signIn(email);
      $('tool-claim-auth-status').textContent = 'Check your inbox and spam folder. Open the newest link in this browser to return and claim your codes.';
    } catch (_err) {
      $('tool-claim-auth-status').textContent = window.CGSubmission.signInErrorMessage(_err);
    }
  });
  document.addEventListener('click', async function (event) {
    var claimButton = event.target.closest('[data-tool-claim]');
    if (claimButton) {
      var tool = claimButton.getAttribute('data-tool-claim');
      var client = window.CGSubmission && window.CGSubmission.client;
      if (!tools.includes(tool) || !client || !participant || !session || String(session.user.email || '').trim().toLowerCase() !== participantEmail()) return;
      claimButton.disabled = true;
      $('tool-claim-status-' + tool).textContent = 'Checking availability…';
      try {
        var result = await client.rpc('claim_tool_code', { p_tool: tool });
        if (result.error) throw result.error;
        var row = Array.isArray(result.data) ? result.data[0] : result.data;
        if (!row || !row.available || !row.code_value) {
          claimed[tool] = '';
          $('tool-claim-output-' + tool).hidden = true;
          $('tool-claim-status-' + tool).textContent = 'All available claims for this offer have been taken.';
          return;
        }
        showValue(tool, String(row.code_value));
      } catch (_err) {
        $('tool-claim-status-' + tool).textContent = 'Could not claim a code. Please try again or ask an organiser for help.';
      } finally {
        claimButton.disabled = false;
      }
      return;
    }
    var copyButton = event.target.closest('[data-tool-copy]');
    if (!copyButton) return;
    var copyTool = copyButton.getAttribute('data-tool-copy');
    var value = claimed[copyTool];
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      $('tool-claim-status-' + copyTool).textContent = 'Copied to clipboard.';
    } catch (_err) {
      $('tool-claim-status-' + copyTool).textContent = 'Copy failed. Select the code or open the link manually.';
    }
  });
  $('tool-claim-signout').addEventListener('click', async function () {
    try { await window.CGSubmission.signOut(); }
    catch (_err) { $('tool-claim-auth-status').textContent = 'Could not sign out. Reload the page and try again.'; }
  });
  document.addEventListener('cg-builder-participant', function (event) {
    setParticipant(event.detail && event.detail.participant);
  });
  document.addEventListener('cg-submission-auth', function (event) {
    session = event.detail && event.detail.session || null;
    if (!session) {
      claimed = {};
      tools.forEach(function (tool) { $('tool-claim-output-' + tool).hidden = true; });
    }
    update();
  });
  if (window.CGSubmission) {
    window.CGSubmission.ready.then(function (readySession) { session = readySession; update(); })
      .catch(function () { $('tool-claim-auth-status').textContent = 'Supabase could not start. Reload and try again.'; });
  }
  setParticipant(window.CGBuilderParticipant || null);
})();