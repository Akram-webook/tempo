/* ============================================================
 * Tempo — Global Feedback widget
 * ------------------------------------------------------------
 * A floating "Feedback" button on every authed page (hidden on the sign-in
 * screen) → a panel with a feedback-first composer (note + icon-only AI
 * Suggest/Polish + optional image + Type + Priority[director/admin only]) and
 * a multi-comment queue. Submit writes ONE row per comment to the "Feedback"
 * tab via WP.config.feedbackEndpoint (all items in a single batch request so
 * it is all-or-nothing).
 *
 * ARCHITECTURE (why this lives in ui/, not core/): it owns DOM + network. The
 * cross-origin POST is a plain fetch() with a FormData body and NO custom
 * headers — the browser sets the multipart boundary, so there is no CORS
 * preflight and a normal fetch() succeeds cross-origin. (The old hidden-iframe
 * form + JSONP-callback transport was retired with the Google layer; there is
 * no JSONP anywhere in the app now.) The endpoint returns {ok:true,count:N}.
 *
 * NEVER LOSE WORK: the queue + composer are mirrored to sessionStorage per
 * page and restored on reopen; the draft is cleared only after a successful
 * submit. Closing with unsent content asks to confirm.
 *
 * CONFIG (never hardcoded — read at call time):
 *   WP.config.feedbackEndpoint  — Apps Script /exec (POST). Empty ⇒ compose
 *                                 works, Submit surfaces "not configured yet".
 *   WP.config.feedbackKey       — shared key sent with the payload (deters
 *                                 casual spam only; real limit is server-side).
 *   WP.config.aiPolishEndpoint  — Suggest/Polish helper. Empty ⇒ AI buttons
 *                                 are hidden (never a dead affordance).
 * ========================================================== */
(function (WP) {
  'use strict';

  var ui = WP.ui;
  var esc = ui.esc;

  var NOTE_MAX = 2000;              // hard cap on a single note (trimmed before send)
  var IMG_MAX_BYTES = 5 * 1024 * 1024;
  var IMG_MAX_DIM = 1600;          // longest edge after client downscale
  var AI_TIMEOUT_MS = 15000;

  // The four allowed types (NO "Question"), feedback-first ordering.
  var TYPES = ['Improvement', 'Bug', 'New idea', 'Design'];
  var PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];

  /* -------- per-page draft persistence (sessionStorage) -------- */
  function pageKey() {
    // Stable per route so a draft belongs to the page it was written on.
    var r = (WP.state && WP.state.route) || 'app';
    return 'tempo_fb_draft:' + r;
  }
  function areaName() {
    // Human-readable page name — never a raw hash/URL (QA G).
    var r = (WP.state && WP.state.route) || '';
    var map = {
      dashboard: 'Dashboard', map: 'Workload Map', profile: 'Profile', me: 'My Progress',
      evaluations: 'Evaluations', evaluation: 'Evaluation', upward: 'Upward Review',
      daily: 'Daily Check-in', settings: 'Settings', permissions: 'Permissions',
      admins: 'Admins', exec: 'Project Status', wellbeing: 'Well-being',
      fairness: 'Fairness', weekly: 'Weekly Report', org: 'Org', library: 'Library',
      activity: 'Activity',
    };
    return map[r] || 'App';
  }

  // In-memory model (source of truth); mirrored to sessionStorage on every change.
  var model = null;   // { queue:[{note,type,image}], composer:{note,type,priority,image} }

  function blankComposer() {
    return { note: '', type: TYPES[0], priority: 'Medium', image: null, imageName: '' };
  }
  function loadModel() {
    if (model) return model;
    var saved = null;
    try { saved = JSON.parse(sessionStorage.getItem(pageKey()) || 'null'); } catch (e) {}
    model = (saved && saved.queue) ? saved : { queue: [], composer: blankComposer() };
    if (!model.composer) model.composer = blankComposer();
    if (!Array.isArray(model.queue)) model.queue = [];
    return model;
  }
  function saveModel() {
    try {
      if (model && (model.queue.length || (model.composer && model.composer.note))) {
        sessionStorage.setItem(pageKey(), JSON.stringify(model));
      } else {
        sessionStorage.removeItem(pageKey());
      }
    } catch (e) {}
  }
  function clearDraft() {
    model = { queue: [], composer: blankComposer() };
    try { sessionStorage.removeItem(pageKey()); } catch (e) {}
  }
  function hasContent() {
    var m = loadModel();
    return m.queue.length > 0 || !!(m.composer.note && m.composer.note.trim());
  }

  /* -------- config helpers -------- */
  function cfg(k) { return (WP.config && typeof WP.config[k] === 'string') ? WP.config[k].trim() : ''; }
  function aiEnabled() { return cfg('aiPolishEndpoint') !== ''; }
  function canSetPriority() { return !!(WP.can && WP.can('viewSettings')); }  // director/admin only

  /* -------- context (silent metadata) -------- */
  function browserInfo() {
    var ua = navigator.userAgent || '';
    var os = /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'macOS' :
      /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Linux/.test(ua) ? 'Linux' : 'Other';
    var br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' :
      /Safari\//.test(ua) ? 'Safari' : 'Other';
    return br + ' · ' + os;
  }

  /* ============================================================
   * FAB — persists across renders in its own host, toggled by auth.
   * ========================================================== */
  function host() {
    var h = document.getElementById('feedback-host');
    if (!h) {
      h = document.createElement('div');
      h.id = 'feedback-host';
      document.body.appendChild(h);
    }
    return h;
  }

  function mount() {
    var h = host();
    var authed = !!(WP.state && WP.state.authed);
    // Signed-in only. The FAB renders even when the endpoint is not yet wired -
    // compose is always available and Submit surfaces "Not configured yet", so a
    // user's typed feedback is never blocked by config. Hidden on login/signed-out.
    if (!authed) { h.innerHTML = ''; return; }
    if (h.querySelector('.fb-fab')) return;      // already mounted; survive re-renders
    var t = WP.i18n.t;
    h.innerHTML =
      '<button type="button" class="fb-fab" id="fb-fab" aria-haspopup="dialog" ' +
        'aria-label="' + esc(t('fbTitle')) + '" title="' + esc(t('fbTitle')) + '">' +
        ui.icon('bulb', 18) +
        '<span class="fb-fab-txt">' + esc(t('fbFab')) + '</span>' +
      '</button>';
    h.querySelector('#fb-fab').addEventListener('click', open);
  }

  /* ============================================================
   * Panel
   * ========================================================== */
  var panelState = null;   // { host, lastFocus, keydown, submitting }

  function open() {
    if (panelState) return;
    var t = WP.i18n.t;
    var m = loadModel();
    var h = host();
    var lastFocus = document.activeElement;

    var wrap = document.createElement('div');
    wrap.className = 'fb-overlay';
    wrap.innerHTML =
      '<div class="fb-backdrop" id="fb-backdrop"></div>' +
      '<div class="fb-panel" role="dialog" aria-modal="true" aria-labelledby="fb-h" ' +
          (WP.i18n.isRTL() ? 'dir="rtl"' : '') + '>' +
        '<div class="fb-head">' +
          '<h2 class="fb-h" id="fb-h">' + esc(t('fbTitle')) + '</h2>' +
          '<button type="button" class="fb-x" id="fb-close" aria-label="' + esc(t('close')) + '">' +
            ui.icon('x', 18) + '</button>' +
        '</div>' +
        '<div class="fb-body" id="fb-body"></div>' +
        '<div class="fb-live" aria-live="polite" role="status" id="fb-live"></div>' +
      '</div>';
    h.appendChild(wrap);

    panelState = { host: wrap, lastFocus: lastFocus, submitting: false };
    renderBody();

    // Close affordances
    wrap.querySelector('#fb-close').addEventListener('click', requestClose);
    wrap.querySelector('#fb-backdrop').addEventListener('click', requestClose);

    // Focus trap + Esc
    panelState.keydown = function (e) {
      if (e.key === 'Escape') { e.preventDefault(); requestClose(); return; }
      if (e.key === 'Tab') trapTab(e);
    };
    document.addEventListener('keydown', panelState.keydown, true);

    // Move focus into the panel (first field).
    setTimeout(function () {
      var f = wrap.querySelector('#fb-note') || wrap.querySelector('#fb-close');
      if (f) try { f.focus(); } catch (e) {}
    }, 30);
  }

  function trapTab(e) {
    if (!panelState) return;
    var panel = panelState.host.querySelector('.fb-panel');
    var sel = 'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';
    var nodes = Array.prototype.slice.call(panel.querySelectorAll(sel))
      .filter(function (n) { return n.offsetParent !== null || n === document.activeElement; });
    if (!nodes.length) return;
    var first = nodes[0], last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function requestClose() {
    var t = WP.i18n.t;
    if (hasContent()) {
      // Draft is already mirrored to sessionStorage; confirm before closing so the
      // user knows it will be restored on reopen (never silently lose work, QA A).
      WP.ui.confirm({
        title: t('fbDiscardTitle'),
        body: '<p>' + esc(t('fbDiscardMsg')) + '</p>',
        confirmLabel: t('fbKeepEditing'),
        cancelLabel: t('fbCloseAnyway'),
      }).then(function (keep) {
        if (keep === false) closePanel();   // "Close anyway" → keep the saved draft, just close
      });
      return;
    }
    closePanel();
  }

  function closePanel() {
    if (!panelState) return;
    document.removeEventListener('keydown', panelState.keydown, true);
    if (panelState.host && panelState.host.parentNode) panelState.host.parentNode.removeChild(panelState.host);
    var lf = panelState.lastFocus;
    panelState = null;
    // Return focus to the FAB (QA E).
    var fab = document.getElementById('fb-fab');
    try { (fab || lf).focus(); } catch (e) {}
  }

  function live(msg) {
    if (!panelState) return;
    var el = panelState.host.querySelector('#fb-live');
    if (el) el.textContent = msg || '';
  }

  /* -------- body render (queue box + composer card) -------- */
  function renderBody() {
    if (!panelState) return;
    var t = WP.i18n.t;
    var m = loadModel();
    var body = panelState.host.querySelector('#fb-body');

    var queueHTML = '';
    if (m.queue.length) {
      queueHTML =
        '<div class="fb-queue" role="group" aria-label="' + esc(t('fbQueueLabel')) + '">' +
          '<div class="fb-queue-h">' + esc(WP.i18n.plural('fbAdded', m.queue.length)) +
            ' <span class="fb-queue-sub">· ' + esc(t('fbSubmittedTogether')) + '</span></div>' +
          m.queue.map(cardHTML).join('') +
        '</div>';
    }

    var typeOpts = TYPES.map(function (ty) {
      return '<option value="' + esc(ty) + '"' + (m.composer.type === ty ? ' selected' : '') + '>' +
        esc(t('fbType_' + ty.replace(/\s/g, ''))) + '</option>';
    }).join('');

    var priorityBlock = canSetPriority()
      ? '<label class="fb-field fb-field-prio">' +
          '<span class="fb-label">' + esc(t('fbPriority')) + '</span>' +
          '<select class="fb-select" id="fb-priority">' +
            PRIORITIES.map(function (p) {
              return '<option value="' + esc(p) + '"' + (m.composer.priority === p ? ' selected' : '') + '>' +
                esc(t('fbPrio_' + p)) + '</option>';
            }).join('') +
          '</select>' +
        '</label>'
      : '';

    var aiBar = aiEnabled()
      ? '<div class="fb-ai" role="group" aria-label="' + esc(t('fbAiGroup')) + '">' +
          '<button type="button" class="fb-ai-btn" id="fb-suggest" ' +
            'aria-label="' + esc(t('fbSuggest')) + '" data-tip="' + esc(t('fbSuggestTip')) + '">' +
            ui.icon('sparkles', 16) + '</button>' +
          '<button type="button" class="fb-ai-btn" id="fb-polish" ' +
            'aria-label="' + esc(t('fbPolish')) + '" data-tip="' + esc(t('fbPolishTip')) + '"' +
            (m.composer.note.trim() ? '' : ' disabled') + '>' +
            ui.icon('pencil', 16) + '</button>' +
          '<button type="button" class="fb-ai-btn fb-undo" id="fb-undo" hidden ' +
            'aria-label="' + esc(t('fbUndo')) + '" data-tip="' + esc(t('fbUndo')) + '">' +
            ui.icon('arrowLeft', 16) + '</button>' +
        '</div>'
      : '';

    var imgBlock = m.composer.image
      ? '<div class="fb-img"><img src="' + esc(m.composer.image) + '" alt="" />' +
          '<button type="button" class="fb-img-rm" id="fb-img-rm" aria-label="' + esc(t('fbRemoveImage')) + '">' +
            ui.icon('x', 14) + '</button></div>'
      : '<label class="fb-img-add" tabindex="0" role="button" aria-label="' + esc(t('fbAddImage')) + '">' +
          ui.icon('plus', 14) + ' <span>' + esc(t('fbAddImage')) + '</span>' +
          '<input type="file" accept="image/*" id="fb-img-input" class="fb-img-input" />' +
        '</label>';

    var addLabel = t('fbAddComment').replace('{n}', String(m.queue.length + 1));
    var configured = cfg('feedbackEndpoint') !== '';
    // When the write endpoint is not wired yet, the button reads "Not configured
    // yet" with an explainer tooltip - compose still works, nothing is lost.
    var submitLabel = configured
      ? WP.i18n.plural('fbSubmitN', m.queue.length + 1)
      : t('fbNotConfigured');
    var submitTip = configured ? '' : ' data-tip="' + esc(t('fbNotConfiguredTip')) + '" aria-describedby="fb-submit-tip"';

    body.innerHTML =
      queueHTML +
      '<div class="fb-composer">' +
        '<div class="fb-composer-h">' + esc(t('fbNewComment').replace('{n}', String(m.queue.length + 1))) + '</div>' +
        '<div class="fb-note-wrap">' +
          '<textarea class="fb-note" id="fb-note" rows="4" maxlength="' + NOTE_MAX + '" ' +
            'placeholder="' + esc(t('fbNotePlaceholder')) + '">' + esc(m.composer.note) + '</textarea>' +
          aiBar +
        '</div>' +
        '<div class="fb-row">' +
          '<label class="fb-field">' +
            '<span class="fb-label">' + esc(t('fbTypeLabel')) + '</span>' +
            '<select class="fb-select" id="fb-type">' + typeOpts + '</select>' +
          '</label>' +
          priorityBlock +
        '</div>' +
        imgBlock +
        '<div class="fb-actions">' +
          '<button type="button" class="btn fb-add" id="fb-add">' + ui.icon('plus', 14) + ' ' + esc(addLabel) + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="fb-submit-row">' +
        '<button type="button" class="btn primary fb-submit' + (configured ? '' : ' fb-submit--unconfigured') + '" id="fb-submit"' + submitTip + '>' +
          '<span class="fb-submit-txt">' + esc(submitLabel) + '</span>' +
          '<span class="fb-spin" aria-hidden="true" hidden></span>' +
        '</button>' +
      '</div>';

    wireBody();
  }

  function cardHTML(item, i) {
    var t = WP.i18n.t;
    var typeLabel = t('fbType_' + item.type.replace(/\s/g, '')) || item.type;
    return '<div class="fb-card" data-i="' + i + '">' +
        (item.image ? '<img class="fb-card-thumb" src="' + esc(item.image) + '" alt="" />' : '') +
        '<div class="fb-card-main">' +
          '<div class="fb-card-note">' + esc(item.note) + '</div>' +
          '<div class="fb-card-meta">' + esc(typeLabel) +
            (item.priority ? ' · ' + esc(t('fbPrio_' + item.priority) || item.priority) : '') + '</div>' +
        '</div>' +
        '<div class="fb-card-acts">' +
          '<button type="button" class="fb-card-btn" data-edit="' + i + '" aria-label="' + esc(t('fbEdit')) + '" data-tip="' + esc(t('fbEdit')) + '">' +
            ui.icon('pencil', 14) + '</button>' +
          '<button type="button" class="fb-card-btn" data-remove="' + i + '" aria-label="' + esc(t('fbRemove')) + '" data-tip="' + esc(t('fbRemove')) + '">' +
            ui.icon('minus', 14) + '</button>' +
        '</div>' +
      '</div>';
  }

  /* -------- body wiring -------- */
  function wireBody() {
    var wrap = panelState.host;
    var m = loadModel();
    var t = WP.i18n.t;

    var note = wrap.querySelector('#fb-note');
    note.addEventListener('input', function () {
      m.composer.note = note.value.slice(0, NOTE_MAX);
      saveModel();
      var polish = wrap.querySelector('#fb-polish');
      if (polish) polish.disabled = !m.composer.note.trim();
    });

    wrap.querySelector('#fb-type').addEventListener('change', function (e) {
      m.composer.type = e.target.value; saveModel();
    });
    var prio = wrap.querySelector('#fb-priority');
    if (prio) prio.addEventListener('change', function (e) { m.composer.priority = e.target.value; saveModel(); });

    // Image input (add) — accept image/* only, ≤5MB, downscale, one per comment (QA C).
    var imgInput = wrap.querySelector('#fb-img-input');
    if (imgInput) imgInput.addEventListener('change', onImagePick);
    var imgAdd = wrap.querySelector('.fb-img-add');
    if (imgAdd) imgAdd.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); imgInput.click(); }
    });
    var imgRm = wrap.querySelector('#fb-img-rm');
    if (imgRm) imgRm.addEventListener('click', function () { m.composer.image = null; m.composer.imageName = ''; saveModel(); renderBody(); });

    // AI buttons
    var suggest = wrap.querySelector('#fb-suggest');
    if (suggest) suggest.addEventListener('click', function () { runAI('suggest'); });
    var polish = wrap.querySelector('#fb-polish');
    if (polish) polish.addEventListener('click', function () { runAI('polish'); });
    var undo = wrap.querySelector('#fb-undo');
    if (undo) undo.addEventListener('click', doUndo);

    // Add to queue
    wrap.querySelector('#fb-add').addEventListener('click', addToQueue);

    // Queue card actions — real buttons, click + keyboard (QA E).
    wrap.querySelectorAll('[data-edit]').forEach(function (b) {
      b.addEventListener('click', function () { editCard(+b.getAttribute('data-edit')); });
    });
    wrap.querySelectorAll('[data-remove]').forEach(function (b) {
      b.addEventListener('click', function () { removeCard(+b.getAttribute('data-remove')); });
    });

    // Submit
    wrap.querySelector('#fb-submit').addEventListener('click', submit);
  }

  /* -------- image handling -------- */
  function onImagePick(e) {
    var t = WP.i18n.t;
    var file = e.target.files && e.target.files[0];
    e.target.value = '';   // allow re-pick of the same file
    if (!file) return;
    if (!/^image\//.test(file.type)) { toastErr(t('fbImgType')); return; }
    var reader = new FileReader();
    reader.onload = function () {
      downscale(reader.result, function (dataUrl, bytes) {
        if (bytes > IMG_MAX_BYTES) { toastErr(t('fbImgTooBig')); return; }
        var m = loadModel();
        m.composer.image = dataUrl;
        m.composer.imageName = file.name || 'image';
        saveModel(); renderBody();
        live(t('fbImgAdded'));
      });
    };
    reader.onerror = function () { toastErr(t('fbImgType')); };
    reader.readAsDataURL(file);
  }

  // Canvas downscale to ≤IMG_MAX_DIM longest edge, JPEG ~0.8. Falls back to the
  // original data URL if canvas is unavailable (jsdom/headless) — size guard still applies.
  function downscale(dataUrl, cb) {
    try {
      var img = new Image();
      img.onload = function () {
        var w = img.width, h = img.height;
        var scale = Math.min(1, IMG_MAX_DIM / Math.max(w, h));
        var cw = Math.round(w * scale), ch = Math.round(h * scale);
        var canvas = document.createElement('canvas');
        canvas.width = cw; canvas.height = ch;
        var ctx = canvas.getContext('2d');
        if (!ctx) { cb(dataUrl, approxBytes(dataUrl)); return; }
        ctx.drawImage(img, 0, 0, cw, ch);
        var out = canvas.toDataURL('image/jpeg', 0.8);
        cb(out, approxBytes(out));
      };
      img.onerror = function () { cb(dataUrl, approxBytes(dataUrl)); };
      img.src = dataUrl;
    } catch (e) { cb(dataUrl, approxBytes(dataUrl)); }
  }
  function approxBytes(dataUrl) {
    var i = dataUrl.indexOf(','); var b64 = i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
    return Math.floor(b64.length * 3 / 4);
  }

  /* -------- AI helpers (Suggest / Polish) -------- */
  var aiUndo = null;   // pre-action note text
  function runAI(mode) {
    var t = WP.i18n.t;
    if (!aiEnabled()) return;
    var wrap = panelState.host;
    var note = wrap.querySelector('#fb-note');
    var current = note.value.trim();
    if (mode === 'polish' && !current) return;   // Polish needs text; Suggest works empty
    var suggest = wrap.querySelector('#fb-suggest'), polish = wrap.querySelector('#fb-polish');
    setDisabled([suggest, polish], true);
    wrap.querySelector('.fb-ai').classList.add('is-loading');
    live(t('fbAiWorking'));

    var url = cfg('aiPolishEndpoint');
    // Spec payload: {action:'suggest'|'polish', note, page}. Suggest drafts from
    // the page when the note is empty; Polish rewrites what was typed.
    var payload = { action: mode, note: current, page: areaName(), key: cfg('feedbackKey') };

    aiRequest(url, payload).then(function (res) {
      var out = res && (res.text || res.result || res.note);
      if (!out) throw new Error('empty');
      aiUndo = note.value;                 // enable undo
      note.value = out;
      loadModel().composer.note = out; saveModel();
      var undo = wrap.querySelector('#fb-undo'); if (undo) undo.hidden = false;
      polish.disabled = !out.trim();
      live(t('fbAiDone'));
    }).catch(function () {
      // Keep original text; friendly retry message (QA H).
      toastErr(t('fbAiFail'));
      live(t('fbAiFail'));
    }).then(function () {
      setDisabled([suggest], false);
      if (polish) polish.disabled = !note.value.trim();
      var bar = wrap.querySelector('.fb-ai'); if (bar) bar.classList.remove('is-loading');
    });
  }
  function doUndo() {
    if (aiUndo == null) return;
    var wrap = panelState.host;
    var note = wrap.querySelector('#fb-note');
    note.value = aiUndo; loadModel().composer.note = aiUndo; saveModel();
    aiUndo = null;
    var undo = wrap.querySelector('#fb-undo'); if (undo) undo.hidden = true;
    var polish = wrap.querySelector('#fb-polish'); if (polish) polish.disabled = !note.value.trim();
  }
  // fetch() JSON POST to the AI endpoint with a hard timeout; never blocks Submit.
  // Text/plain content-type keeps it a "simple" request (no CORS preflight).
  function aiRequest(url, payload) {
    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, AI_TIMEOUT_MS);
    var opts = { method: 'POST', body: JSON.stringify(payload),
      headers: { 'Content-Type': 'text/plain;charset=utf-8' } };
    if (ctrl) opts.signal = ctrl.signal;
    return fetch(url, opts).then(function (res) {
      clearTimeout(timer);
      if (!res.ok) throw new Error('ai http ' + res.status);
      return res.json();
    }, function (err) { clearTimeout(timer); throw err; });
  }

  /* -------- queue ops -------- */
  function addToQueue() {
    var t = WP.i18n.t;
    var m = loadModel();
    var note = (m.composer.note || '').trim();
    if (!note) { toastErr(t('fbNoteRequired')); focusNote(); return; }
    var item = { note: note.slice(0, NOTE_MAX), type: m.composer.type, image: m.composer.image || null, imageName: m.composer.imageName || '' };
    if (canSetPriority()) item.priority = m.composer.priority;
    m.queue.push(item);
    m.composer = blankComposer();
    aiUndo = null;
    saveModel();
    renderBody();
    flashAdded();
    live(WP.i18n.plural('fbAdded', m.queue.length));
  }
  function editCard(i) {
    var m = loadModel();
    var item = m.queue[i];
    if (!item) return;
    // Reload into composer; drop from queue (edit = reopen).
    m.composer = { note: item.note, type: item.type, priority: item.priority || 'Medium', image: item.image || null, imageName: item.imageName || '' };
    m.queue.splice(i, 1);
    saveModel();
    renderBody();
    focusNote();
  }
  function removeCard(i) {
    var m = loadModel();
    m.queue.splice(i, 1);
    saveModel();
    renderBody();
    live(WP.i18n.plural('fbAdded', m.queue.length));
  }
  function focusNote() {
    var n = panelState && panelState.host.querySelector('#fb-note');
    if (n) try { n.focus(); } catch (e) {}
  }
  function flashAdded() {
    var t = WP.i18n.t;
    var wrap = panelState && panelState.host;
    if (!wrap) return;
    var h = wrap.querySelector('.fb-composer-h');
    if (!h) return;
    var f = document.createElement('span');
    f.className = 'fb-added-flash';
    f.textContent = t('fbAddedOk');
    h.appendChild(f);
    setTimeout(function () { if (f.parentNode) f.parentNode.removeChild(f); }, 1600);
  }

  /* -------- submit (batch, one request; guard double-submit) -------- */
  function submit() {
    var t = WP.i18n.t;
    if (panelState && panelState.submitting) return;   // double-submit guard (QA B)
    var m = loadModel();

    // Fold any composed-but-not-added note into the batch (so nothing is dropped).
    var items = m.queue.slice();
    var pending = (m.composer.note || '').trim();
    if (pending) {
      var it = { note: pending.slice(0, NOTE_MAX), type: m.composer.type, image: m.composer.image || null };
      if (canSetPriority()) it.priority = m.composer.priority;
      items.push(it);
    }
    if (!items.length) { toastErr(t('fbNoteRequired')); focusNote(); return; }

    var endpoint = cfg('feedbackEndpoint');
    if (!endpoint) { toastErr(t('fbNotConfigured')); return; }   // graceful when unset (acceptance)

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      toastErr(t('fbOffline')); return;                          // offline (QA A)
    }

    setSubmitting(true);
    live(t('fbSending'));

    var viewer = WP.viewer && WP.viewer();
    var owner = viewer ? (WP.auth && WP.auth.emailOf ? WP.auth.emailOf(viewer) : (viewer.name || viewer.id)) : '';
    var screen = (window.screen ? window.screen.width + '×' + window.screen.height : '');
    var context = browserInfo() + (screen ? ' · ' + screen : '');

    // One row per comment. priority is blanked for a non-director (never trust a
    // client priority from a caller we can't verify as a director — QA F).
    var itemsPayload = items.map(function (it) {
      return {
        note: it.note,
        type: it.type,
        priority: canSetPriority() ? (it.priority || 'Medium') : '',
        image: it.image || '',
        imageName: it.imageName || '',
      };
    });

    // FormData with no custom Content-Type ⇒ browser sets the multipart boundary
    // ⇒ a "simple" request with no CORS preflight. Shared silent fields:
    // who/when/page/context/url apply to every row in the batch (QA G).
    var fd = new FormData();
    fd.append('key', cfg('feedbackKey'));
    fd.append('submittedAt', new Date().toISOString());
    fd.append('owner', owner);
    fd.append('area', areaName());
    fd.append('context', context);
    fd.append('url', (location && location.href) || '');
    fd.append('status', 'New');
    fd.append('items', JSON.stringify(itemsPayload));

    postBatch(endpoint, fd).then(function (res) {
      var count = (res && (res.count != null ? res.count : res.ok ? items.length : 0)) || 0;
      if (!res || res.ok === false) throw new Error('endpoint');
      clearDraft();                                     // clear ONLY on success (QA A/B)
      setSubmitting(false);
      toastOk(WP.i18n.plural('fbSentN', count || items.length));
      live(WP.i18n.plural('fbSentN', count || items.length));
      closePanel();
    }).catch(function () {
      // Keep the queue intact; offer retry (QA A/B).
      setSubmitting(false);
      var msg = (typeof navigator !== 'undefined' && navigator.onLine === false) ? t('fbOffline') : t('fbSendFail');
      toastErr(msg);
      live(msg);
      var btn = panelState && panelState.host.querySelector('.fb-submit-txt');
      if (btn) btn.textContent = t('fbRetry');
    });
  }

  function setSubmitting(on) {
    if (!panelState) return;
    panelState.submitting = on;
    var wrap = panelState.host;
    var btn = wrap.querySelector('#fb-submit');
    var spin = wrap.querySelector('.fb-spin');
    if (btn) btn.disabled = on;
    if (spin) spin.hidden = !on;
    // Disable the whole composer while sending.
    wrap.querySelectorAll('button:not(#fb-close), textarea, select, input').forEach(function (el) {
      if (el === btn) return;
      el.disabled = on;
    });
  }

  // Cross-origin batch POST via plain fetch() with a FormData body. No custom
  // headers ⇒ the browser sets the multipart boundary ⇒ a "simple" request with
  // NO CORS preflight, so this works cross-origin without any Google/iframe hack.
  // Endpoint returns {ok:true,count:N}. A hard timeout keeps a hung request from
  // pinning the panel; the queue is preserved on any failure so Submit can retry.
  function postBatch(url, fd) {
    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 20000);
    var opts = { method: 'POST', body: fd };
    if (ctrl) opts.signal = ctrl.signal;
    return fetch(url, opts).then(function (res) {
      clearTimeout(timer);
      if (!res.ok) throw new Error('http ' + res.status);
      return res.json();
    }, function (err) { clearTimeout(timer); throw err; });
  }

  /* -------- small ui utils -------- */
  function setDisabled(list, on) { list.forEach(function (el) { if (el) el.disabled = on; }); }
  function toastOk(msg) { if (ui.toast) ui.toast(msg, 'success'); }
  function toastErr(msg) { if (ui.toast) ui.toast(msg, 'error'); }

  WP.ui.feedback = {
    mount: mount,
    open: open,
    _close: closePanel,
    _reset: function () { model = null; try { sessionStorage.clear(); } catch (e) {} },
    _model: function () { return loadModel(); },
    _areaName: areaName,
    _canSetPriority: canSetPriority,
  };
})(window.WP = window.WP || {});
