/* Public project gallery. The database opens it only after the submission deadline. */
(function () {
  'use strict';
  var EVENT_ID = 'common-ground-2026-10-11';
  var client = window.CGSubmission && window.CGSubmission.client;
  var section = document.getElementById('project-gallery');
  var message = document.getElementById('project-gallery-message');
  var cards = document.getElementById('project-gallery-cards');
  var refreshButton = document.getElementById('gallery-refresh');
  var status = window.CGEventStatus || {};
  var request = 0;
  var loaded = false;

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
  function detail(label, value) {
    if (!value) return '';
    return '<div class="submission-detail"><strong>' + escape(label) + '</strong><p>' + escape(value) + '</p></div>';
  }
  function link(label, value) {
    var href = safeHref(value);
    return href ? '<a href="' + href + '" target="_blank" rel="noopener noreferrer">' + escape(label) + ' ↗</a>' : '';
  }
  function render(rows) {
    if (!rows.length) {
      message.textContent = 'No ready submissions were received by 3:15 PM.';
      cards.innerHTML = '';
      document.dispatchEvent(new CustomEvent('cg-gallery-loaded', {detail:{rows:[]}}));
      return;
    }
    message.textContent = rows.length + (rows.length === 1 ? ' project' : ' projects');
    cards.innerHTML = rows.map(function (row) {
      var tracks = Array.isArray(row.tracks) ? row.tracks : [];
      var members = Array.isArray(row.team_members) ? row.team_members.filter(Boolean) : [];
      var links = [
        link('Live demo', row.demo_url),
        link('Demo video', row.video_url),
        link('Source code', row.source_url),
        link('Prototype', row.prototype_url)
      ].filter(Boolean).join('');
      return '<article class="project-gallery-card" data-submission-id="' + escape(row.submission_id) +
        '" data-is-my-team="' + (row.is_my_team ? 'true' : 'false') + '">' +
        '<span class="gallery-team">' + escape(row.team_name || 'Team') +
        (members.length ? ' · ' + escape(members.join(', ')) : '') +
        (row.is_my_team ? ' · Your team' : '') + '</span>' +
        '<h3>' + escape(row.project_name || 'Untitled project') + '</h3>' +
        (tracks.length ? '<div class="project-gallery-tracks">' + tracks.map(function (track) {
          return '<span>' + escape(track) + '</span>';
        }).join('') + '</div>' : '') +
        (row.one_liner ? '<p><strong>' + escape(row.one_liner) + '</strong></p>' : '') +
        (row.project_overview ? '<p>' + escape(row.project_overview) + '</p>' : '') +
        (row.build_summary ? '<p>' + escape(row.build_summary) + '</p>' : '') +
        detail('Design × Tech reflection', row.design_reflection) +
        detail('Culture × Tech reflection', row.culture_reflection) +
        detail('Team & collaboration', row.team_collaboration) +
        detail('AI & tool attribution', row.ai_attribution) +
        detail('Supporting materials', row.supporting_materials) +
        (links ? '<div class="project-gallery-links">' + links + '</div>' : '') +
        '</article>';
    }).join('');
    document.dispatchEvent(new CustomEvent('cg-gallery-loaded', {detail:{rows:rows}}));
  }
  async function load() {
    var current = ++request;
    if (!status.gallery_open) return;
    if (!client) {
      message.textContent = 'The gallery is unavailable right now. Please refresh in a moment.';
      return;
    }
    message.textContent = 'Loading projects…';
    try {
      var result = await client.rpc('get_ready_project_gallery', {p_event_id: EVENT_ID});
      if (current !== request) return;
      if (result.error) throw result.error;
      loaded = true;
      render(result.data || []);
    } catch (_err) {
      if (current !== request) return;
      cards.innerHTML = '';
      message.textContent = 'The gallery is unavailable right now. Please refresh in a moment.';
      document.dispatchEvent(new CustomEvent('cg-gallery-loaded', {detail:{rows:[]}}));
    }
  }
  function update(nextStatus) {
    status = nextStatus || {};
    var open = !!status.gallery_open;
    section.hidden = !open;
    refreshButton.hidden = !open;
    if (!open) return;
    if (!loaded) load();
  }
  if (refreshButton) refreshButton.addEventListener('click', function () {
    loaded = false;
    load();
  });
  document.addEventListener('cg-event-status', function (event) { update(event.detail); });
  update(window.CGEventStatus);
})();
