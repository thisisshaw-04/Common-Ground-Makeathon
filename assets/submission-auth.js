/* Common Ground Supabase auth client. */
(function () {
  'use strict';
  var config = window.CG_SUPABASE_CONFIG || {};
  var client = window.supabase && window.supabase.createClient && config.url && config.publishableKey
    ? window.supabase.createClient(config.url, config.publishableKey)
    : null;
  var session = null;
  var ready = client ? client.auth.getSession().then(function (result) {
    if (result.error) throw result.error;
    session = result.data.session;
    return session;
  }) : Promise.resolve(null);
  var pendingSignIns = Object.create(null);
  var lastSignInRequest = Object.create(null);
  var signInCooldownMs = 60000;

  function signInRedirectUrl(returnToPanel) {
    var currentUrl = new URL(window.location.href);
    if (returnToPanel === 'choice') {
      currentUrl.search = '';
      currentUrl.hash = 'choice';
      return currentUrl.href;
    }
    if (/\/submissions\.html$/i.test(currentUrl.pathname)) {
      currentUrl.search = '';
      currentUrl.hash = '';
      return currentUrl.href;
    }
    var returnToChoice = false;
    try {
      var requestedAt = Number(window.localStorage.getItem('cg-return-to-choice-after-signin'));
      returnToChoice = Number.isFinite(requestedAt) && Date.now() - requestedAt < 30 * 60 * 1000;
    } catch (_err) { /* Fall back to the access page if browser storage is unavailable. */ }
    var portalUrl = new URL('./', currentUrl.href);
    portalUrl.search = '';
    portalUrl.hash = returnToChoice ? 'choice' : 'access';
    return portalUrl.href;
  }

  function signInErrorMessage(error) {
    if (error && error.code === 'cg_sign_in_cooldown') return error.message;
    var code = String(error && error.code || '').toLowerCase();
    var message = String(error && error.message || '').toLowerCase();
    var status = Number(error && error.status || 0);
    if (status === 429 || code.indexOf('rate') !== -1 || message.indexOf('rate limit') !== -1 || message.indexOf('too many') !== -1) {
      return 'Too many sign-in emails were requested. Wait at least a minute, then use the newest link. Each link works only once.';
    }
    if (status >= 500) {
      return 'The sign-in email service is busy. Wait a minute before requesting one link again, then use the newest email.';
    }
    return 'Could not send the sign-in link. Check the address. If this keeps happening, tell an organiser.';
  }

  if (client) {
    client.auth.onAuthStateChange(function (_event, nextSession) {
      session = nextSession;
      window.setTimeout(function () {
        document.dispatchEvent(new CustomEvent('cg-submission-auth', { detail: { session: session } }));
      }, 0);
    });
  }

  window.CGSubmission = {
    client: client,
    ready: ready,
    getSession: function () { return session; },
    getUser: function () { return session && session.user || null; },
    signInErrorMessage: signInErrorMessage,
    signIn: async function (email, options) {
      if (!client) throw new Error('Submission sign-in is not configured yet.');
      options = options || {};
      email = String(email || '').trim().toLowerCase();
      if (pendingSignIns[email]) return pendingSignIns[email];
      var lastRequest = lastSignInRequest[email] || 0;
      var waitMs = signInCooldownMs - (Date.now() - lastRequest);
      if (waitMs > 0) {
        var cooldownError = new Error('A sign-in email was just requested. Wait ' + Math.ceil(waitMs / 1000) + ' seconds, then use the newest link.');
        cooldownError.code = 'cg_sign_in_cooldown';
        throw cooldownError;
      }
      lastSignInRequest[email] = Date.now();
      var request = client.auth.signInWithOtp({
        email: email,
        options: { emailRedirectTo: signInRedirectUrl(options.returnToPanel) }
      }).then(function (result) {
        if (result.error) throw result.error;
        return result;
      });
      pendingSignIns[email] = request;
      try {
        return await request;
      } finally {
        delete pendingSignIns[email];
      }
    },
    verifyEmailCode: async function (email, token) {
      if (!client) throw new Error('Submission sign-in is not configured yet.');
      var result = await client.auth.verifyOtp({
        email: String(email || '').trim().toLowerCase(),
        token: String(token || '').replace(/\D/g, ''),
        type: 'email'
      });
      if (result.error) throw result.error;
      session = result.data.session || session;
      return result.data;
    },
    signOut: async function () {
      if (!client) return;
      var result = await client.auth.signOut();
      if (result.error) throw result.error;
    }
  };
})();
