/* Authenticated first-come-first-served OpenAI code claims. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var participant = null;
  var session = null;
  var codeUrl = '';
  var section = $('openai-code-claim');
  if (!section) return;

  function participantEmail() {
    return String(participant && participant.email || '').trim().toLowerCase();
  }
  function codesAreOpen() {
    var data = window.CGData && window.CGData.load();
    return !!(data && data.event && window.CGData.codesOpen(data.event));
  }
  function showCode(url) {
    codeUrl = url;
    $('openai-code-anchor').href = url;
    $('openai-code-link').hidden = false;
    $('openai-claim-result').textContent = 'This code is reserved for your signed-in account.';
  }
  function update() {
    var eligiblePage = !!(participant && participant.status === 'confirmed' && codesAreOpen());
    section.hidden = !eligiblePage;
    if (!eligiblePage) return;
    var userEmail = String(session && session.user && session.user.email || '').trim().toLowerCase();
    $('openai-claim-login').hidden = !!userEmail;
    $('openai-claim-button').hidden = !userEmail || userEmail !== participantEmail();
    $('openai-claim-signout').hidden = !userEmail;
    $('openai-claim-result').textContent = '';
    $('openai-code-link').hidden = !codeUrl || userEmail !== participantEmail();
    if (!window.CGSubmission || !window.CGSubmission.client) {
      $('openai-claim-login').hidden = true;
      $('openai-claim-result').textContent = 'Supabase sign-in is not configured yet.';
      return;
    }
    if (!userEmail) {
      $('openai-claim-login').hidden = false;
      $('openai-claim-email').value = participantEmail();
      $('openai-claim-result').textContent = 'Sign in with your approved registration email. The first 100 approved builders to claim receive one OpenAI code.';
    } else if (userEmail !== participantEmail()) {
      $('openai-claim-result').textContent = 'You are signed in with a different email. Sign out, then use the email shown above.';
    } else if (!codeUrl) {
      $('openai-claim-result').textContent = 'Claim now. If you already claimed on this account, this retrieves the same code.';
    }
  }
  function setParticipant(next) {
    var oldEmail = participantEmail();
    participant = next || null;
    if (participantEmail() !== oldEmail) {
      codeUrl = '';
      $('openai-code-link').hidden = true;
    }
    update();
  }
  $('openai-claim-login').addEventListener('submit', async function (event) {
    event.preventDefault();
    var email = String($('openai-claim-email').value || '').trim().toLowerCase();
    if (!participant || email !== participantEmail()) {
      $('openai-claim-result').textContent = 'Use the approved registration email shown above.';
      return;
    }
    try {
      await window.CGSubmission.signIn(email);
      $('openai-claim-result').textContent = 'Check your email for the sign-in link, then return here to claim your code.';
    } catch (_err) {
      $('openai-claim-result').textContent = 'Could not send a sign-in link. Check the email and try again.';
    }
  });
  $('openai-claim-button').addEventListener('click', async function () {
    var client = window.CGSubmission && window.CGSubmission.client;
    if (!client || !participant || !session || String(session.user.email || '').trim().toLowerCase() !== participantEmail()) return;
    $('openai-claim-button').disabled = true;
    $('openai-claim-result').textContent = 'Checking code availability…';
    try {
      var result = await client.rpc('claim_tool_code', { p_tool: 'openai' });
      if (result.error) throw result.error;
      var row = Array.isArray(result.data) ? result.data[0] : result.data;
      if (!row || !row.available || !row.code_url) {
        codeUrl = '';
        $('openai-code-link').hidden = true;
        $('openai-claim-result').textContent = 'All 100 OpenAI codes have been claimed.';
        return;
      }
      var parsed = new URL(row.code_url);
      if (parsed.protocol !== 'https:') throw new Error('Invalid code link');
      showCode(parsed.href);
    } catch (_err) {
      $('openai-claim-result').textContent = 'Could not claim a code. Please try again or ask an organiser for help.';
    } finally {
      $('openai-claim-button').disabled = false;
    }
  });
  $('openai-claim-signout').addEventListener('click', async function () {
    try { await window.CGSubmission.signOut(); }
    catch (_err) { $('openai-claim-result').textContent = 'Could not sign out. Reload the page and try again.'; }
  });
  $('openai-code-copy').addEventListener('click', async function () {
    if (!codeUrl) return;
    try {
      await navigator.clipboard.writeText(codeUrl);
      $('openai-claim-result').textContent = 'OpenAI code link copied.';
    } catch (_err) {
      $('openai-claim-result').textContent = 'Copy failed. Open the link and copy it from the address bar.';
    }
  });
  document.addEventListener('cg-builder-participant', function (event) {
    setParticipant(event.detail && event.detail.participant);
  });
  document.addEventListener('cg-submission-auth', function (event) {
    session = event.detail && event.detail.session || null;
    if (!session) {
      codeUrl = '';
      $('openai-code-link').hidden = true;
    }
    update();
  });
  if (window.CGSubmission) {
    window.CGSubmission.ready.then(function (readySession) { session = readySession; update(); })
      .catch(function () { $('openai-claim-result').textContent = 'Supabase could not start. Reload and try again.'; });
  }
  setParticipant(window.CGBuilderParticipant || null);
})();