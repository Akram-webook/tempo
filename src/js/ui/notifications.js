/* ============================================================
 * Tempo — Notifications bell + inbox (Phase 1, in-app only)
 * ------------------------------------------------------------
 * The top-bar bell + count badge + inbox popover. Reads the "what needs me"
 * list from the DOM-free engine (WP.notifications.buildItems) and paints it.
 * Async "needs input" data comes from the Executive Status endpoint, fetched
 * here via the shared WP.ui.jsonp helper (ui layer owns the DOM + network),
 * then handed to buildItems — so core stays pure/testable and Phase 2 (Slack)
 * can reuse the exact same engine.
 *
 * Calm by design: badge only when >0 (cap 9+), no firehose, friendly empty
 * state, no red-dot spam. Dismiss/seen is personal (engine, per-viewer).
 * Fully gated: WP.config.notificationsEnabled=false ⇒ renders nothing.
 * ========================================================== */
(function (WP) {
  'use strict';
  var ui = WP.ui;

  // Cache of the last exec payload requests[] so opening the panel is instant
  // and a refresh re-fetches. Keyed nothing fancy — one viewer at a time.
  var execRequests = null;   // null = not loaded, [] = loaded-empty
  var loadState = 'idle';    // 'idle' | 'loading' | 'ok' | 'error'

  function enabled() { return !!(WP.config && WP.config.notificationsEnabled); }

  function items() {
    return WP.notifications.buildItems(WP.viewer(), { execRequests: execRequests || [] });
  }

  // ---- badge -----------------------------------------------------------------
  function badgeHTML(n) {
    if (!n) return '';
    var label = n > 9 ? '9+' : String(n);
    return '<span class="notif-badge" aria-hidden="true">' + label + '</span>';
  }

  function refreshBadge() {
    var btn = document.getElementById('notif-btn');
    if (!btn) return;
    var n = items().length;
    var old = btn.querySelector('.notif-badge');
    if (old) old.remove();
    if (n) btn.insertAdjacentHTML('beforeend', badgeHTML(n));
    var t = WP.i18n.t;
    btn.setAttribute('aria-label', n ? (t('notifications') + ' (' + n + ')') : t('notifications'));
  }

  // ---- panel -----------------------------------------------------------------
  function rowHTML(it) {
    var t = WP.i18n.t;
    var when = it.at ? relTime(it.at) : '';
    return '<li class="notif-row" data-id="' + ui.esc(it.id) + '" data-route="' + ui.esc(it.route || '') + '" tabindex="0" role="button">' +
        '<span class="notif-ic" aria-hidden="true">' + ui.icon(it.icon || 'bell', 16) + '</span>' +
        '<span class="notif-main">' +
          '<span class="notif-text">' + ui.esc(it.text) + '</span>' +
          '<span class="notif-meta">' + (it.area ? ui.esc(it.area) : '') +
            (when ? '<span class="notif-dot">·</span>' + ui.esc(when) : '') + '</span>' +
        '</span>' +
        '<button type="button" class="notif-x" data-dismiss="' + ui.esc(it.id) + '" aria-label="' + t('dismiss') + '" title="' + t('dismiss') + '">' + ui.icon('x', 14) + '</button>' +
      '</li>';
  }

  function bodyHTML() {
    var t = WP.i18n.t;
    if (loadState === 'loading' && execRequests === null && WP.notifications.needsExecData(WP.viewer())) {
      return '<div class="notif-skel"><span></span><span></span><span></span></div>';
    }
    if (loadState === 'error' && execRequests === null) {
      return '<div class="notif-msg">' + ui.icon('alert', 16) + '<span>' + t('notifLoadError') + '</span>' +
        '<button type="button" class="btn notif-retry" id="notif-retry">' + t('execRetry') + '</button></div>';
    }
    var list = items();
    if (!list.length) {
      return '<div class="notif-empty">' + ui.icon('check', 20) + '<div>' + t('allCaughtUp') + '</div></div>';
    }
    return '<ul class="notif-list">' + list.map(rowHTML).join('') + '</ul>';
  }

  function panelHTML() {
    var t = WP.i18n.t;
    var list = items();
    var canClear = list.length > 0;
    return '<div class="notif-head">' +
        '<span class="notif-title">' + t('notifications') + '</span>' +
        (canClear ? '<button type="button" class="notif-clear" id="notif-clear">' + t('markAllRead') + '</button>' : '') +
      '</div>' +
      '<div class="notif-body">' + bodyHTML() + '</div>';
  }

  function relTime(iso) {
    var t = WP.i18n.t;
    var then = Date.parse(iso);
    if (isNaN(then)) return '';
    var secs = Math.max(0, Math.round((Date.now() - then) / 1000));
    if (secs < 60) return t('execJustNow');
    var mins = Math.round(secs / 60); if (mins < 60) return mins + t('execMinAgo');
    var hrs = Math.round(mins / 60); if (hrs < 24) return hrs + t('execHrAgo');
    return Math.round(hrs / 24) + t('execDayAgo');
  }

  function paintPanel() {
    var panel = document.getElementById('notif-panel');
    if (!panel) return;
    panel.innerHTML = panelHTML();
    wirePanel(panel);
  }

  function wirePanel(panel) {
    var clear = panel.querySelector('#notif-clear');
    if (clear) clear.onclick = function (e) {
      e.stopPropagation();
      WP.notifications.dismissAll(WP.state.viewerId, items().map(function (i) { return i.id; }));
      paintPanel(); refreshBadge();
    };
    var retry = panel.querySelector('#notif-retry');
    if (retry) retry.onclick = function (e) { e.stopPropagation(); loadExec(true); };
    panel.querySelectorAll('[data-dismiss]').forEach(function (b) {
      b.onclick = function (e) {
        e.stopPropagation();
        WP.notifications.dismiss(WP.state.viewerId, b.getAttribute('data-dismiss'));
        paintPanel(); refreshBadge();
      };
    });
    panel.querySelectorAll('.notif-row').forEach(function (row) {
      var go = function () {
        var r = row.getAttribute('data-route');
        closePanel();
        if (r) WP.setState({ route: r, selectedId: null });
      };
      row.onclick = go;
      row.onkeydown = function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); go(); } };
    });
  }

  function isOpen() {
    var wrap = document.getElementById('notif');
    return !!(wrap && wrap.classList.contains('open'));
  }
  function openPanel() {
    var wrap = document.getElementById('notif');
    if (!wrap) return;
    wrap.classList.add('open');
    var btn = document.getElementById('notif-btn');
    if (btn) btn.setAttribute('aria-expanded', 'true');
    paintPanel();
    // fetch exec data on first open if this viewer needs it
    if (execRequests === null && WP.notifications.needsExecData(WP.viewer())) loadExec(false);
  }
  function closePanel() {
    var wrap = document.getElementById('notif');
    if (!wrap) return;
    wrap.classList.remove('open');
    var btn = document.getElementById('notif-btn');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  // Fetch the Executive Status endpoint (same source as the exec view) to get
  // the Feedback requests[] for the "needs input" items. Reuses WP.ui.jsonp.
  function loadExec(force) {
    var url = (WP.config.execStatusEndpoint || '').trim();
    // No endpoint → nothing to fetch; resolve to empty immediately (checked
    // BEFORE the in-flight guard so a stuck request can't block the empty case).
    if (!url) { loadState = 'ok'; execRequests = []; if (isOpen()) paintPanel(); refreshBadge(); return; }
    if (loadState === 'loading') return;
    if (execRequests !== null && !force) return;
    loadState = 'loading';
    if (isOpen()) paintPanel();
    ui.jsonp(url).then(function (data) {
      execRequests = (data && data.requests) || [];
      loadState = 'ok';
      if (isOpen()) paintPanel();
      refreshBadge();
    }).catch(function () {
      loadState = 'error';
      if (isOpen()) paintPanel();
      refreshBadge();
    });
  }

  /* Mount the bell into the appbar (called from topbar()). Renders nothing when
   * the feature is off or there is no signed-in viewer. */
  function mount(appbar) {
    if (!enabled() || !WP.viewer()) return;
    var t = WP.i18n.t;
    // insert before the account control
    var account = appbar.querySelector('#account');
    var html =
      '<div class="notif" id="notif">' +
        '<button type="button" class="btn icon-btn notif-btn" id="notif-btn" aria-haspopup="true" aria-expanded="false" aria-label="' + t('notifications') + '">' +
          ui.icon('bell', 20) +
        '</button>' +
        '<div class="notif-panel" id="notif-panel" role="dialog" aria-label="' + t('notifications') + '"></div>' +
      '</div>';
    if (account) account.insertAdjacentHTML('beforebegin', html);
    else appbar.insertAdjacentHTML('beforeend', html);

    var wrap = document.getElementById('notif');
    var btn = document.getElementById('notif-btn');
    btn.onclick = function (e) { e.stopPropagation(); if (isOpen()) closePanel(); else openPanel(); };

    // close on outside click / Esc (single shared handlers, replaced each render)
    if (WP._notifDocClose) document.removeEventListener('click', WP._notifDocClose);
    WP._notifDocClose = function (ev) { var w = document.getElementById('notif'); if (w && !w.contains(ev.target)) closePanel(); };
    document.addEventListener('click', WP._notifDocClose);
    if (WP._notifEsc) document.removeEventListener('keydown', WP._notifEsc);
    WP._notifEsc = function (ev) { if (ev.key === 'Escape' && isOpen()) { closePanel(); btn.focus(); } };
    document.addEventListener('keydown', WP._notifEsc);

    // initial badge: instant from in-memory sources; kick a fetch if needed so
    // the count reflects "needs input" without opening the panel.
    refreshBadge();
    if (execRequests === null && WP.notifications.needsExecData(WP.viewer())) loadExec(false);
    void wrap;
  }

  WP.ui.notifications = { mount: mount, refreshBadge: refreshBadge, _items: items };
})(window.WP = window.WP || {});
