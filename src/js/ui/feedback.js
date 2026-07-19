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
 * transport is the GitHub warehouse: each comment is ONE workflow_dispatch to
 * the Receive Feedback Action (JSON POST + Authorization: Bearer), which appends
 * the item to data/feedback.json and commits it back; Pages serves the file.
 * GitHub returns HTTP 204 on success. No Google, no Apps Script, no JSONP.
 * Submit requires BOTH feedbackEndpoint AND feedbackDispatchToken - a token in
 * the PUBLIC bundle is a hole, so until a token-safe transport exists this stays
 * "Not configured yet" and never sends (compose still works, nothing is lost).
 *
 * NEVER LOSE WORK: the queue + composer are mirrored to sessionStorage per
 * page and restored on reopen; the draft is cleared only after a successful
 * submit. Closing with unsent content asks to confirm.
 *
 * CONFIG (never hardcoded — read at call time):
 *   WP.config.feedbackEndpoint       — the Receive Feedback workflow_dispatch
 *                                      URL. Empty ⇒ Submit shows "Not configured".
 *   WP.config.feedbackDispatchToken  — GitHub token for the dispatch. Empty ⇒
 *                                      "Not configured" (never ship a real token
 *                                      in the public bundle — use a proxy).
 *   WP.config.feedbackKey            — legacy, unused by the GitHub transport.
 *   WP.config.aiPolishEndpoint       — Suggest/Polish helper. Empty ⇒ AI buttons
 *                                      are hidden (never a dead affordance).
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

  /* -------- Local story engine (Polish): classify + structure ----------------
   * Turns a raw note into a triage-ready STORY - so a director can look at the
   * feedback later and immediately see WHAT it is (front-end? back-end? a bug? a
   * new skill?), what it affects, and what's being asked for. This is a local,
   * dependency-free heuristic that runs in the bundle (no backend, no token). It
   * is deliberately structured so a real model can replace `polishLocally` later
   * with NO other change: when aiPolishEndpoint is set, runAI() POSTs instead and
   * the remote result is expected in the SAME { story, area, type } shape.
   *
   * Honest limit: keyword rules, not an LLM. It is transparent and good enough to
   * pre-sort the triage queue; the director always confirms before it ships. */
  var STORY_VERSION = 1;

  // Ordered so the FIRST match wins for area (most specific signal first). Each
  // area = a lane the director triages into. Kept small + legible on purpose.
  var AREA_RULES = [
    { area: 'Bug',        re: /\b(bug|broken|crash|error|fails?|failing|doesn'?t work|not working|wrong|glitch|freezes?|blank|nan|undefined|500|404|regression)\b/i },
    { area: 'Backend',    re: /\b(api|endpoint|server|database|db|query|sql|auth|token|webhook|sync|job|cron|payload|latency|timeout|rate.?limit|cache|schema|migration)\b/i },
    { area: 'Frontend',   re: /\b(button|screen|page|layout|css|style|colou?r|font|icon|modal|dropdown|scroll|responsive|mobile|dark mode|rtl|align|spacing|render|ui|ux|click|hover|tooltip)\b/i },
    { area: 'New skill',  re: /\b(new (feature|skill|ability|capability)|add (a )?(new )?(feature|skill|ability)|we (need|should have)|it should be able to|support for|integrate|integration|connect to)\b/i },
    { area: 'Enhancement',re: /\b(improve|enhance|better|faster|easier|polish|refine|optimi[sz]e|streamline|simplif|cleaner|nicer|smoother|reduce)\b/i },
    { area: 'Feature',    re: /\b(feature|filter|export|report|dashboard|view|search|sort|notification|reminder|shortcut|bulk|toggle)\b/i },
  ];

  // Map the classified area to the composer's Type dropdown (TYPES), so Polish
  // can auto-select the right Type. area -> one of TYPES.
  var AREA_TO_TYPE = {
    Bug: 'Bug', Backend: 'Improvement', Frontend: 'Design',
    Feature: 'New idea', 'New skill': 'New idea', Enhancement: 'Improvement',
  };

  function classifyArea(text) {
    var s = String(text || '');
    for (var i = 0; i < AREA_RULES.length; i++) {
      if (AREA_RULES[i].re.test(s)) return AREA_RULES[i].area;
    }
    return 'Feature';   // neutral default: an idea worth reviewing
  }

  // Split into sentences, cheaply. Keeps it framework-free.
  function sentences(text) {
    return String(text || '').replace(/\s+/g, ' ').trim()
      .split(/(?<=[.!?])\s+/).map(function (x) { return x.trim(); }).filter(Boolean);
  }
  function titleCaseFirst(s) { s = String(s || '').trim(); return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  // A short, human title from the note (first strong clause, capped).
  function deriveTitle(text) {
    var first = (sentences(text)[0] || String(text || '')).trim();
    first = first.replace(/^(i (think|feel|want|wish|would like)|can (we|you)|please|it would be (nice|good|great) (if|to)|we (need|should))\b[\s,:-]*/i, '');
    first = titleCaseFirst(first).replace(/[.!?]+$/, '');
    if (first.length > 80) first = first.slice(0, 77).replace(/\s+\S*$/, '') + '...';
    return first || 'Untitled feedback';
  }

  // Build the structured story locally. Returns the SAME shape a remote model is
  // expected to return, so the two are interchangeable.
  // Recognise a note this engine already produced, so a SECOND Polish is a no-op
  // instead of re-wrapping (which nested "[Bug] [Bug] ... Context: ..." - a real
  // bug: directors click Polish twice). Matches a leading "[Area] Title" line.
  function looksPolished(raw) {
    return /^\s*\[[^\]]+\]\s*.+/.test(raw) && /(^|\n)\s*(Context|Impact|Suggestion|السياق|الأثر|الاقتراح)\s*:/.test(raw);
  }
  // Parse an already-polished note back into a story object (idempotency path).
  function parseStory(raw, page) {
    var m = /^\s*\[([^\]]+)\]\s*(.*)$/.exec((raw.split('\n')[0] || '').trim());
    var area = (m && m[1]) || classifyArea(raw + ' ' + (page || ''));
    var title = (m && m[2]) || deriveTitle(raw);
    // Pull the first Context:/Impact:/Suggestion: value if present (EN or AR label).
    function field(re) { var x = re.exec(raw); return x ? x[1].trim() : ''; }
    var context = field(/(?:^|\n)\s*(?:Context|السياق)\s*:\s*([^\n]*)/i);
    var impact = field(/(?:^|\n)\s*(?:Impact|الأثر)\s*:\s*([^\n]*)/i);
    var suggestion = field(/(?:^|\n)\s*(?:Suggestion|الاقتراح)\s*:\s*([^\n]*)/i);
    return { v: STORY_VERSION, title: title, area: area, context: context || title,
      impact: impact, suggestion: suggestion, type: AREA_TO_TYPE[area] || 'New idea' };
  }

  function polishLocally(note, page) {
    var raw = String(note || '').trim();
    // Idempotency: re-polishing an already-structured note must not nest/duplicate.
    if (looksPolished(raw)) return parseStory(raw, page);
    var area = classifyArea(raw + ' ' + (page || ''));
    var ss = sentences(raw);
    var title = deriveTitle(raw);
    // Impact = a sentence that mentions a consequence/why; else the first line.
    var impact = ss.filter(function (x) { return /\b(so that|because|which means|impact|slows?|confus|hard|can'?t|unable|lose|risk|wastes?)\b/i.test(x); })[0] || '';
    // Suggestion = a sentence phrased as an ask; else empty (director decides).
    var suggestion = ss.filter(function (x) { return /\b(should|could|add|make|allow|let|enable|need|want|please|instead|rather)\b/i.test(x); })[0] || '';
    var context = raw;
    return {
      v: STORY_VERSION,
      title: title,
      area: area,
      context: context,
      impact: impact,
      suggestion: suggestion,
      type: AREA_TO_TYPE[area] || 'New idea',
    };
  }

  // Render a story object back into a clean note the composer shows + submits.
  function storyToNote(story) {
    if (!story) return '';
    var L = WP.i18n.t;
    var lines = [];
    lines.push('[' + (story.area || 'Feature') + '] ' + (story.title || ''));
    lines.push('');
    if (story.context)    lines.push(L('fbStoryContext') + ': ' + story.context);
    if (story.impact)     lines.push(L('fbStoryImpact') + ': ' + story.impact);
    if (story.suggestion) lines.push(L('fbStorySuggestion') + ': ' + story.suggestion);
    return lines.join('\n');
  }
  // Export the pure pieces for tests + the warehouse compute to reuse.
  WP.fbStory = { classifyArea: classifyArea, polishLocally: polishLocally,
    storyToNote: storyToNote, deriveTitle: deriveTitle, AREA_TO_TYPE: AREA_TO_TYPE };

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
      // Icon-only round FAB - minimal footprint so it never covers content. The
      // aria-label + title keep it fully labelled for screen readers + hover.
      '<button type="button" class="fb-fab" id="fb-fab" aria-haspopup="dialog" ' +
        'aria-label="' + esc(t('fbTitle')) + '" title="' + esc(t('fbTitle')) + '">' +
        ui.icon('bulb', 20) +
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

    // Polish always shows - it runs locally (structures the note into a triage
    // story + auto-classifies the Type), no backend needed. Suggest (draft from an
    // empty note by reading the page) needs the remote endpoint, so it's gated.
    var suggestBtn = aiEnabled()
      ? '<button type="button" class="fb-ai-btn" id="fb-suggest" ' +
          'aria-label="' + esc(t('fbSuggest')) + '" data-tip="' + esc(t('fbSuggestTip')) + '">' +
          ui.icon('bulb', 16) + '</button>'
      : '';
    var aiBar = '<div class="fb-ai" role="group" aria-label="' + esc(t('fbAiGroup')) + '">' +
        suggestBtn +
        '<button type="button" class="fb-ai-btn" id="fb-polish" ' +
          'aria-label="' + esc(t('fbPolish')) + '" data-tip="' + esc(t('fbPolishTip')) + '"' +
          (m.composer.note.trim() ? '' : ' disabled') + '>' +
          ui.icon('sparkles', 16) + '</button>' +
        '<button type="button" class="fb-ai-btn fb-undo" id="fb-undo" hidden ' +
          'aria-label="' + esc(t('fbUndo')) + '" data-tip="' + esc(t('fbUndo')) + '">' +
          ui.icon('arrowLeft', 16) + '</button>' +
      '</div>';

    var imgBlock = m.composer.image
      ? '<div class="fb-img"><img src="' + esc(m.composer.image) + '" alt="" />' +
          '<button type="button" class="fb-img-rm" id="fb-img-rm" aria-label="' + esc(t('fbRemoveImage')) + '">' +
            ui.icon('x', 14) + '</button></div>'
      : '<label class="fb-img-add" tabindex="0" role="button" aria-label="' + esc(t('fbAddImage')) + '">' +
          ui.icon('plus', 14) + ' <span>' + esc(t('fbAddImage')) + '</span>' +
          '<input type="file" accept="image/*" id="fb-img-input" class="fb-img-input" />' +
        '</label>';

    var addLabel = t('fbAddComment').replace('{n}', String(m.queue.length + 1));
    // Configured = both the dispatch URL and a token are present (a token-safe
    // transport is wired). Either missing ⇒ "Not configured yet".
    var configured = cfg('feedbackEndpoint') !== '' && cfg('feedbackDispatchToken') !== '';
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
  // Apply a finished story to the composer: replace the note with the structured
  // version AND auto-select the Type the classifier inferred. Shared by the local
  // and the remote path so they behave identically.
  function applyStory(story) {
    var wrap = panelState.host;
    var note = wrap.querySelector('#fb-note');
    var out = WP.fbStory.storyToNote(story);
    aiUndo = note.value;                 // enable undo
    note.value = out;
    var m = loadModel();
    m.composer.note = out;
    if (story.type) m.composer.type = story.type;   // auto-classify the Type dropdown
    saveModel();
    // reflect the new Type in the <select> if it's mounted
    var typeSel = wrap.querySelector('#fb-type');
    if (typeSel && story.type) typeSel.value = story.type;
    var undo = wrap.querySelector('#fb-undo'); if (undo) undo.hidden = false;
  }

  function runAI(mode) {
    var t = WP.i18n.t;
    var wrap = panelState.host;
    var note = wrap.querySelector('#fb-note');
    var current = note.value.trim();
    if (mode === 'polish' && !current) return;   // Polish needs text; Suggest works empty
    var suggest = wrap.querySelector('#fb-suggest'), polish = wrap.querySelector('#fb-polish');

    // LOCAL Polish path: no AI endpoint wired -> build the story in the bundle.
    // (Suggest still needs the remote endpoint to draft from an empty note.)
    if (mode === 'polish' && !aiEnabled()) {
      var story = WP.fbStory.polishLocally(current, areaName());
      applyStory(story);
      if (polish) polish.disabled = !note.value.trim();
      live(t('fbAiDone'));
      return;
    }
    if (!aiEnabled()) return;   // Suggest with no endpoint: nothing to do
    setDisabled([suggest, polish], true);
    wrap.querySelector('.fb-ai').classList.add('is-loading');
    live(t('fbAiWorking'));

    var url = cfg('aiPolishEndpoint');
    // Spec payload: {action:'suggest'|'polish', note, page}. Suggest drafts from
    // the page when the note is empty; Polish rewrites what was typed.
    var payload = { action: mode, note: current, page: areaName(), key: cfg('feedbackKey') };

    aiRequest(url, payload).then(function (res) {
      // Preferred: the endpoint returns a structured story ({title,area,...}).
      // Fallback: plain text (older endpoint) -> classify it locally so Type is
      // still set. Either way the composer ends up with a story + a Type.
      var story = (res && res.story && typeof res.story === 'object') ? res.story : null;
      if (mode === 'polish' && !story) {
        var out0 = res && (res.text || res.result || res.note);
        if (out0) story = WP.fbStory.polishLocally(out0, areaName());
      }
      if (story) { applyStory(story); polish.disabled = !note.value.trim(); live(t('fbAiDone')); return; }
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

  /* -------- submit (GitHub warehouse: one dispatch per comment) -------- */
  // Transport = the Receive Feedback GitHub Action. Each comment is ONE
  // workflow_dispatch; the Action appends it to data/feedback.json and commits
  // it back (git history = audit log), Pages serves the file. We require BOTH a
  // configured endpoint AND a token before sending - a token in the PUBLIC
  // bundle is a security hole, so until a token-safe transport exists this stays
  // in the "Not configured yet" state and Submit never fires (compose still works).
  function submit() {
    var t = WP.i18n.t;
    if (panelState && panelState.submitting) return;   // double-submit guard (QA B)
    var m = loadModel();

    // Fold any composed-but-not-added note in (so nothing is dropped).
    var items = m.queue.slice();
    var pending = (m.composer.note || '').trim();
    if (pending) {
      var it = { note: pending.slice(0, NOTE_MAX), type: m.composer.type };
      if (canSetPriority()) it.priority = m.composer.priority;
      items.push(it);
    }
    if (!items.length) { toastErr(t('fbNoteRequired')); focusNote(); return; }

    // Warehouse transport needs both the dispatch URL and a token. Either missing
    // ⇒ "Not configured yet" (never a silent drop, never a leaked-token send).
    var endpoint = cfg('feedbackEndpoint');
    var token = cfg('feedbackDispatchToken');
    if (!endpoint || !token) { toastErr(t('fbNotConfigured')); return; }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      toastErr(t('fbOffline')); return;                          // offline (QA A)
    }

    setSubmitting(true);
    live(t('fbSending'));

    var viewer = WP.viewer && WP.viewer();
    var owner = viewer ? (WP.auth && WP.auth.emailOf ? WP.auth.emailOf(viewer) : (viewer.name || viewer.id)) : '';
    var screen = (window.screen ? window.screen.width + '×' + window.screen.height : '');
    var context = browserInfo() + (screen ? ' · ' + screen : '');
    var when = new Date().toISOString();

    // Build one dispatch payload per comment. priority blanked for a non-director
    // (never trust a client priority we can't verify - QA F). NOTE: images are not
    // carried by the dispatch transport (workflow_dispatch inputs are small string
    // fields; a base64 image would blow the input limit and bloat git history).
    var dispatches = items.map(function (it) {
      // classified lane: a Polished note starts with "[Area] Title". Fall back to
      // classifying the raw note so even an un-polished submission is triage-ready.
      var m2 = /^\[([^\]]+)\]/.exec(it.note || '');
      var klass = (m2 && m2[1]) || WP.fbStory.classifyArea(it.note || '');
      return {
        ref: 'main',
        inputs: {
          note: it.note,
          type: it.type,
          klass: klass,                       // Frontend|Backend|Bug|Feature|Enhancement|New skill
          priority: canSetPriority() ? (it.priority || 'Medium') : '',
          owner: owner,
          area: areaName(),                   // which PAGE it came from
          context: context,
          url: (location && location.href) || '',
          submittedAt: when,
        },
      };
    });

    // All dispatches must succeed (each returns HTTP 204). If any fails, keep the
    // whole queue and let the user retry - never a partial silent success.
    Promise.all(dispatches.map(function (p) { return dispatchOne(endpoint, token, p); }))
      .then(function () {
        clearDraft();                                   // clear ONLY on full success (QA A/B)
        setSubmitting(false);
        toastOk(WP.i18n.plural('fbSentN', items.length));
        live(WP.i18n.plural('fbSentN', items.length));
        closePanel();
      }).catch(function () {
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

  // One workflow_dispatch to the Receive Feedback Action. GitHub's dispatch API
  // returns HTTP 204 (No Content) on success - anything else is a failure. This
  // fetch DOES carry an Authorization header, so a CORS preflight fires; GitHub's
  // API supports browser CORS, so that is fine. A hard timeout keeps a hung
  // request from pinning the panel; the queue is preserved on any failure.
  function dispatchOne(url, token, payload) {
    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 20000);
    var opts = {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    };
    if (ctrl) opts.signal = ctrl.signal;
    return fetch(url, opts).then(function (res) {
      clearTimeout(timer);
      if (res.status !== 204) throw new Error('dispatch http ' + res.status);
      return true;
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
