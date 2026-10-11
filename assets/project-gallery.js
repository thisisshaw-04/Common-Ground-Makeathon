/* Public project gallery opens at 3:15 PM; final submissions remain open until 3:30 PM. */
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
  function youtubeThumbnail(value) {
    try {
      var url = new URL(value);
      var host = url.hostname.toLowerCase().replace(/^www\./, '');
      var id = '';
      if (host === 'youtu.be') id = url.pathname.split('/').filter(Boolean)[0] || '';
      else if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
        id = url.searchParams.get('v') || '';
        if (!id) id = (url.pathname.match(/\/(?:embed|shorts|live)\/([\w-]{6,})/) || [])[1] || '';
      }
      return /^[\w-]{6,}$/.test(id) ? 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg' : '';
    } catch (_err) { return ''; }
  }
  function previewImage(row) {
    var direct = row.preview_image_url || row.preview_image || row.previewImage;
    var image = safeHref(direct);
    if (image) return image;
    var candidates = [row.demo_url, row.video_url];
    for (var i = 0; i < candidates.length; i++) {
      var candidate = safeHref(candidates[i]);
      if (candidate && /\.(?:png|jpe?g|gif|webp|avif)(?:$|[?#])/i.test(candidate)) return candidate;
    }
    return youtubeThumbnail(row.video_url || '');
  }
  function previewMarkup(row, name, oneLiner) {
    var image = previewImage(row);
    return '<div class="project-gallery-preview' + (image ? ' has-image' : '') + '">' +
      (image ? '<img src="' + image + '" alt="' + escape(name) + ' project preview" loading="lazy" referrerpolicy="no-referrer">' : '') +
      '<span class="preview-kicker">COMMON GROUND / PROJECT</span>' +
      (!image ? '<strong>' + escape(name) + '</strong>' : '') +
      '<span class="preview-caption">' + escape(image ? 'A look inside the project' : (oneLiner || 'Open the project details to see what the team made.')) + '</span>' +
      '</div>';
  }
  function detail(label, value) {
    if (!value) return '';
    return '<div class="submission-detail"><strong>' + escape(label) + '</strong><p>' + escape(value) + '</p></div>';
  }
  function projectOverview(row) {
    var value = row.project_overview || '';
    var legacyCombined = row.one_liner ? 'Inspiration: ' + row.one_liner : '';
    return value === legacyCombined ? row.one_liner : (value || row.one_liner || '');
  }
  function projectBuild(row) {
    var text = String(row.build_summary || '');
    var isCombinedAnswer = row.one_liner && row.project_overview === 'Inspiration: ' + row.one_liner;
    return isCombinedAnswer && text.indexOf('Technology: ') === 0 ? text.slice('Technology: '.length) : text;
  }
  function link(label, value) {
    var href = safeHref(value);
    return href ? '<a href="' + href + '" target="_blank" rel="noopener noreferrer">' + escape(label) + ' ↗</a>' : '';
  }
  function focusRequestedProject() {
    var projectId = new URLSearchParams(window.location.search).get('project');
    if (!projectId) return;
    var card = document.getElementById('project-' + projectId);
    if (!card) return;
    var trigger = card.querySelector('[data-project-modal-open]');
    window.setTimeout(function () {
      card.scrollIntoView({behavior:'smooth',block:'center'});
      if (trigger) trigger.click();
    }, 100);
  }
  function render(rows) {
    if (!rows.length) {
      message.textContent = 'No ready submissions yet. Teams can still submit or update until 3:30 PM SGT.';
      cards.innerHTML = '';
      document.dispatchEvent(new CustomEvent('cg-gallery-loaded', {detail:{rows:[]}}));
      return;
    }
    message.textContent = rows.length + (rows.length === 1 ? ' project' : ' projects');
    cards.innerHTML = rows.map(function (row) {
      var name = row.project_name || 'Untitled project';
      var team = row.team_name || 'Team';
      var oneLiner = row.one_liner || '';
      var overview = projectOverview(row);
      var build = projectBuild(row);
      var tracks = Array.isArray(row.tracks) ? row.tracks : [];
      var members = Array.isArray(row.team_members) ? row.team_members.filter(Boolean) : [];
      var links = [
        link('Live demo', row.demo_url),
        link('Demo video', row.video_url),
        link('Source code', row.source_url),
        link('Prototype', row.prototype_url)
      ].filter(Boolean).join('');
      var expanded = detail('Team members', members.join(', ')) +
        detail('Project overview', overview) +
        detail('The build', build) +
        detail('Design × Tech reflection', row.design_reflection) +
        detail('Culture × Tech reflection', row.culture_reflection) +
        detail('Team & collaboration', row.team_collaboration) +
        detail('AI & tool attribution', row.ai_attribution) +
        detail('Supporting materials', row.supporting_materials) +
        (links ? '<div class="project-gallery-links">' + links + '</div>' : '');
      var modalContent = '<div class="project-modal-project">' +
        '<h2>' + escape(name) + '</h2>' +
        '<p class="project-modal-team">' + escape(team) + (row.is_my_team ? ' · Your team' : '') + '</p>' +
        (tracks.length ? '<div class="project-gallery-tracks">' + tracks.map(function (track) {
          return '<span>' + escape(track) + '</span>';
        }).join('') + '</div>' : '') +
        (oneLiner && oneLiner !== overview ? '<p class="project-modal-one-liner">' + escape(oneLiner) + '</p>' : '') +
        '<div class="project-modal-details">' + (expanded || '<p class="helper">No additional details were shared.</p>') + '</div>' +
        '</div>';
      return '<article class="project-gallery-card" id="project-' + escape(row.submission_id) + '" data-project-modal-card data-submission-id="' + escape(row.submission_id) +
        '" data-is-my-team="' + (row.is_my_team ? 'true' : 'false') + '">' +
        '<button class="project-modal-trigger project-gallery-trigger" type="button" data-project-modal-open aria-haspopup="dialog">' +
        previewMarkup(row, name, oneLiner) +
        '<div class="project-gallery-copy">' +
        '<span class="gallery-team">' + escape(team) + (row.is_my_team ? ' · Your team' : '') + '</span>' +
        '<h3>' + escape(name) + '</h3>' +
        (tracks.length ? '<div class="project-gallery-tracks">' + tracks.map(function (track) {
          return '<span>' + escape(track) + '</span>';
        }).join('') + '</div>' : '') +
        (oneLiner ? '<p class="project-gallery-one-liner">' + escape(oneLiner) + '</p>' : '') +
        '<span class="project-gallery-toggle"><span>View project details</span><span aria-hidden="true">↗</span></span>' +
        '</div></button>' +
        '<template data-project-modal-content>' + modalContent + '</template></article>';
    }).join('');
    focusRequestedProject();
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
