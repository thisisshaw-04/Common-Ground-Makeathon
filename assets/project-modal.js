/* Accessible shared modal for public and organiser project cards. */
(function () {
  'use strict';
  var dialog = document.createElement('dialog');
  dialog.className = 'project-modal';
  dialog.setAttribute('aria-label', 'Project details');
  dialog.innerHTML =
    '<div class="project-modal-shell">' +
      '<header class="project-modal-header">' +
        '<span class="project-modal-overline">COMMON GROUND / PROJECT DETAILS</span>' +
        '<button class="project-modal-close" type="button" data-project-modal-close autofocus>' +
          '<span>Close</span><span aria-hidden="true">×</span>' +
        '</button>' +
      '</header>' +
      '<div class="project-modal-body" data-project-modal-body></div>' +
    '</div>';
  document.body.appendChild(dialog);
  var body = dialog.querySelector('[data-project-modal-body]');
  var lastTrigger = null;

  document.addEventListener('click', function (event) {
    var trigger = event.target.closest('[data-project-modal-open]');
    if (!trigger || typeof dialog.showModal !== 'function') return;
    var card = trigger.closest('[data-project-modal-card]');
    var template = card && card.querySelector('template[data-project-modal-content]');
    if (!template) return;
    lastTrigger = trigger;
    body.replaceChildren(template.content.cloneNode(true));
    dialog.showModal();
    dialog.querySelector('[data-project-modal-close]').focus();
  });

  dialog.addEventListener('click', function (event) {
    if (event.target === dialog || event.target.closest('[data-project-modal-close]')) {
      dialog.close();
    }
  });

  dialog.addEventListener('close', function () {
    body.replaceChildren();
    if (lastTrigger && lastTrigger.isConnected) lastTrigger.focus();
    lastTrigger = null;
  });
})();
