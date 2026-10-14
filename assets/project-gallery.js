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
  function driveThumbnail(value) {
    try {
      var url = new URL(value);
      var host = url.hostname.toLowerCase();
      if (host.indexOf('www.') === 0) host = host.slice(4);
      if (host !== 'drive.google.com') return '';
      var segments = url.pathname.split('/');
      var id = segments[1] === 'file' && segments[2] === 'd'
        ? segments[3]
        : ((url.pathname === '/uc' || url.pathname === '/open') ? url.searchParams.get('id') : '');
      return id && /^[A-Za-z0-9_-]+$/.test(id)
        ? 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(id) + '&sz=w1200'
        : '';
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
    var videoSources = [row.video_url, row.demo_url, row.prototype_url];
    for (var j = 0; j < videoSources.length; j++) {
      var youtube = youtubeThumbnail(videoSources[j] || '');
      if (youtube) return youtube;
    }
    for (var k = 0; k < videoSources.length; k++) {
      var drive = driveThumbnail(videoSources[k] || '');
      if (drive) return drive;
    }
    // Use the submitted still itself, not the ad-heavy Postimages share page.
    if (row.video_url === 'https://postimg.cc/T5dgFgYY') {
      return 'https://i.postimg.cc/cxkbbDTD/Whats-App-Image-2026-10-11-at-15-35-37.jpg';
    }
    return '';
  }
  function previewMarkup(row, name, oneLiner) {
    var image = previewImage(row);
    return '<div class="project-gallery-preview' + (image ? ' has-image' : '') + '">' +
      (image ? '<img src="' + image + '" alt="' + escape(name) + ' project preview" loading="lazy" referrerpolicy="no-referrer">' : '') +
      '</div>';
  }
  var AWARD_BY_SUBMISSION = {
    '571179e5-7f4c-4c66-93c1-ede16510df69': 'Culture × Tech Award',
    '05ffd087-231c-4672-ba73-32e0424d89cd': 'Design × Tech Award',
    '42d8f39b-0c16-4fd5-8493-c37afeb808fc': 'Best Use of Tech Award',
    'f690e28f-9605-4047-952d-c3ce5c49a619': 'Best Common Ground Award'
  };
  var FINALIST_BY_PROJECT = {
    'common heritage': true,
    'saami': true,
    'prereads: search. plan. read.': true,
    'you & ai': true
  };

  function awardMarkup(row) {
    var award = AWARD_BY_SUBMISSION[String(row.submission_id || '')];
    if (award) {
      return '<div class="project-award-badge" aria-label="' + escape(award) + '">' +
        '<strong>' + escape(award) + '</strong>' +
        '</div>';
    }
    var projectName = String(row.project_name || '').trim().toLowerCase();
    if (!FINALIST_BY_PROJECT[projectName]) return '';
    return '<div class="project-award-badge" aria-label="Finalist"><strong>Finalist</strong></div>';
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
  function projectCredit(row) {
    var attribution = String(row.ai_attribution || '');
    var match = attribution.match(/^[ \t]*Additional project credit:[ \t]*(.+?)[ \t]*\.?[ \t]*$/im);
    return match ? match[1].trim() : '';
  }
  function projectAttribution(row) {
    return String(row.ai_attribution || '')
      .replace(/^[ \t]*Additional project credit:[ \t]*.+?[ \t]*\.?[ \t]*$/im, '')
      .trim();
  }
  function link(label, value) {
    var href = safeHref(value);
    return href ? '<a href="' + href + '" target="_blank" rel="noopener noreferrer">' + escape(label) + ' ↗</a>' : '';
  }
  function projectShareUrl(submissionId) {
    var url = new URL(window.location.href);
    url.search = '';
    url.searchParams.set('project', submissionId);
    url.hash = 'choice';
    return url.toString();
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
    // Show award winners first, then finalists, then all other projects.
    // Keep preview-ready projects first within each group, preserving their order otherwise.
    rows = rows.map(function (row, index) {
      var projectName = String(row.project_name || '').trim().toLowerCase();
      var group = AWARD_BY_SUBMISSION[String(row.submission_id || '')] ? 0
        : (FINALIST_BY_PROJECT[projectName] ? 1 : 2);
      return {row: row, index: index, group: group, hasImage: !!previewImage(row)};
    }).sort(function (a, b) {
      return (a.group - b.group)
        || (Number(b.hasImage) - Number(a.hasImage))
        || (a.index - b.index);
    }).map(function (item) {
      return item.row;
    });
    message.textContent = '';
    cards.innerHTML = rows.map(function (row) {
      var name = row.project_name || 'Untitled project';
      var team = row.team_name || 'Team';
      var oneLiner = row.one_liner || '';
      var overview = projectOverview(row);
      var build = projectBuild(row);
      var tracks = Array.isArray(row.tracks) ? row.tracks : [];
      var members = Array.isArray(row.team_members) ? row.team_members.filter(Boolean) : [];
      var credit = projectCredit(row);
      var attribution = projectAttribution(row);
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
        detail('Project credit', credit) +
        detail('AI & tool attribution', attribution) +
        detail('Supporting materials', row.supporting_materials);
      var modalContent = '<div class="project-modal-project">' +
        '<div class="project-modal-title-row"><h2>' + escape(name) + '</h2>' +
        (links ? '<div class="project-gallery-links">' + links + '</div>' : '') + '</div>' +
        '<p class="project-modal-team">' + escape(team) + (row.is_my_team ? ' · Your team' : '') + '</p>' +
        awardMarkup(row) +
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
        awardMarkup(row) +
        (tracks.length ? '<div class="project-gallery-tracks">' + tracks.map(function (track) {
          return '<span>' + escape(track) + '</span>';
        }).join('') + '</div>' : '') +
        (oneLiner ? '<p class="project-gallery-one-liner">' + escape(oneLiner) + '</p>' : '') +
        '<span class="project-gallery-toggle"><span>View project details</span><span aria-hidden="true">↗</span></span>' +
        '</div></button>' +
        '<div class="project-gallery-share-row"><button class="project-gallery-share" type="button" data-copy-project-link data-share-url="' +
        escape(projectShareUrl(row.submission_id)) + '" aria-label="Copy a link to ' + escape(name) + '" aria-live="polite">Copy project link</button></div>' +
        '<template data-project-modal-content>' + modalContent + '</template></article>';
    }).join('');
    focusRequestedProject();
    document.dispatchEvent(new CustomEvent('cg-gallery-loaded', {detail:{rows:rows}}));
  }
  function fallbackCopy(text) {
    var field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.opacity = '0';
    field.style.pointerEvents = 'none';
    document.body.appendChild(field);
    field.select();
    var copied = false;
    try { copied = document.execCommand('copy'); } catch (_err) { copied = false; }
    field.remove();
    if (!copied) throw new Error('Clipboard copy failed.');
  }
  function copyText(text) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      return navigator.clipboard.writeText(text).catch(function () {
        fallbackCopy(text);
      });
    }
    fallbackCopy(text);
    return Promise.resolve();
  }
  cards.addEventListener('click', function (event) {
    var button = event.target.closest('[data-copy-project-link]');
    if (!button || !cards.contains(button)) return;
    event.preventDefault();
    var url = button.getAttribute('data-share-url');
    if (!url) return;
    var label = 'Copy project link';
    var ariaLabel = button.getAttribute('aria-label') || label;
    button.disabled = true;
    copyText(url).then(function () {
      button.textContent = 'Link copied';
      button.setAttribute('aria-label', 'Project link copied');
    }).catch(function () {
      button.textContent = 'Copy failed';
      button.setAttribute('aria-label', 'Could not copy project link');
    }).finally(function () {
      button.disabled = false;
      window.setTimeout(function () {
        if (!button.isConnected) return;
        button.textContent = label;
        button.setAttribute('aria-label', ariaLabel);
      }, 1800);
    });
  });

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
      var imageResult = await client.rpc('get_project_gallery_preview_images', {p_event_id: EVENT_ID});
      if (current !== request) return;
      var imageById = Object.create(null);
      if (!imageResult.error) {
        (imageResult.data || []).forEach(function (image) {
          if (image.preview_image_url) imageById[image.submission_id] = image.preview_image_url;
        });
      }
      var rows = result.data || [];
      rows.forEach(function (row) {
        if (imageById[row.submission_id]) row.preview_image_url = imageById[row.submission_id];
      });
      loaded = true;
      render(rows);
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
