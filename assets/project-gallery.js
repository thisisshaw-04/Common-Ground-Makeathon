/* Attendee-only view of ready project submissions. The RPC enforces access in Supabase. */
(function () {
  'use strict';
  var EVENT_ID = 'common-ground-2026-10-11';
  var client = window.CGSubmission && window.CGSubmission.client;
  var section = document.getElementById('project-gallery');
  var message = document.getElementById('project-gallery-message');
  var cards = document.getElementById('project-gallery-cards');
  var navLink = document.querySelector('[data-gallery-nav]');
  var eligible = window.CGBuilderEligibility === true;
  var request = 0;

  function escape(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function safeHref(value) {
    try {
      var url = new URL(value);
      return /^https?:$/.test(url.protocol) ? escape(url.href) : '';
    } catch (_err) { return ''; }
  }
  function setVisible(value) {
    section.hidden = !value;
    if (navLink) navLink.hidden = !value;
  }
  function link(label, value) {
    var href = safeHref(value);
    return href ? '<a href="' + href + '" target="_blank" rel="noopener noreferrer">' + escape(label) + ' ↗</a>' : '';
  }
  function render(rows) {
    if (!rows.length) {
      message.textContent = 'No ready project submissions yet. Projects will appear here after teams submit.';
      cards.innerHTML = '';
      return;
    }
    message.textContent = rows.length + (rows.length === 1 ? ' ready project' : ' ready projects') + ' from the makeathon.';
    cards.innerHTML = rows.map(function (row) {
      var tracks = Array.isArray(row.tracks) ? row.tracks : [];
      var links = [
        link('Live demo', row.demo_url),
        link('Demo video', row.video_url),
        link('Source code', row.source_url),
        link('Prototype', row.prototype_url)
      ].filter(Boolean).join('');
      return '<article class="project-gallery-card">' +
        '<span class="gallery-team">' + escape(row.team_name || 'Team') + '</span>' +
        '<h3>' + escape(row.project_name || 'Untitled project') + '</h3>' +
        (tracks.length ? '<div class="project-gallery-tracks">' + tracks.map(function (track) {
          return '<span>' + escape(track) + '</span>';
        }).join('') + '</div>' : '') +
        (row.one_liner ? '<p><strong>' + escape(row.one_liner) + '</strong></p>' : '') +
        (row.project_overview ? '<p>' + escape(row.project_overview) + '</p>' : '') +
        (row.build_summary ? '<p>' + escape(row.build_summary) + '</p>' : '') +
        (links ? '<div class="project-gallery-links">' + links + '</div>' : '') +
        '</article>';
    }).join('');
  }
  async function load() {
    var current = ++request;
    if (!eligible || !client) return;
    message.textContent = 'Loading ready projects…';
    try {
      var result = await client.rpc('get_ready_project_gallery', {p_event_id: EVENT_ID});
      if (current !== request) return;
      if (result.error) throw result.error;
      render(result.data || []);
    } catch (_err) {
      if (current !== request) return;
      cards.innerHTML = '';
      message.textContent = 'The project gallery is temporarily unavailable. Please refresh or ask an organiser.';
    }
  }
  function updateEligibility(event) {
    eligible = !!(event && event.detail && event.detail.eligible);
    setVisible(eligible);
    if (!eligible) {
      request += 1;
      cards.innerHTML = '';
      message.textContent = '';
      return;
    }
    load();
  }
  document.addEventListener('cg-builder-eligibility', updateEligibility);
  setVisible(eligible);
  if (eligible) load();
})();