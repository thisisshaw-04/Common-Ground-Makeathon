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
    signIn: async function (email) {
      if (!client) throw new Error('Submission sign-in is not configured yet.');
      var result = await client.auth.signInWithOtp({
        email: email,
        options: { emailRedirectTo: new URL('./', window.location.href).href }
      });
      if (result.error) throw result.error;
      return result;
    },
    signOut: async function () {
      if (!client) return;
      var result = await client.auth.signOut();
      if (result.error) throw result.error;
    }
  };
})();
