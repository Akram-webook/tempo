/* ============================================================
 * Tempo — Executive Status (native, live from the Feedback sheet)
 * ------------------------------------------------------------
 * A native, on-brand render of the SAME "Tempo - Feedback (Live)" sheet the
 * Google Slides deck builds from. This view holds NO data of its own — it reads
 * a deployed Apps Script JSON endpoint (WP.config.execStatusEndpoint) at view
 * time via JSONP and paints the result. Deck + page are two thin views over one
 * source of truth (the sheet). Transport is the shared WP.ui.jsonp helper
 * (ui layer — it needs the DOM; core is kept DOM-free by rule).
 *
 * WHY native (not an embedded deck iframe): a PRIVATE Google Slides deck does
 * not frame inline — Google shows a sign-in / request-access box. We keep the
 * deck PRIVATE and reach it via the "Open / present" button (board / PDF /
 * present mode) instead of embedding it.
 *
 * Gated to Director + Admin (WP.execDeckVisible → endpoint set AND
 * WP.can('viewSettings')). Re-checked here (defence in depth): a member or an
 * empty endpoint redirects home and renders nothing.
 * ========================================================== */
(function (WP) {
  'use strict';
  const ui = WP.ui;

  // status -> colour bucket. NOTE: the Google Slides deck (docs/exec-deck/Code.gs)
  // is a SEPARATE Apps Script runtime and keeps its OWN copy of this rule — it
  // cannot import this file, so this is NOT a shared module. The two are kept in
  // sync by hand + the bucket contract pinned in test/verify-exec.js (change one
  // side's regex and CI trips). Keep Code.gs's statusColorKey aligned.
  function statusColorKey(raw) {
    const s = String(raw || '').toLowerCase();
    if (/done|live|shipped|on.?track/.test(s)) return 'green';
    if (/working|in.?progress|in.?review|next/.test(s)) return 'amber';
    if (/needs?.?input|needs?.?you|blocked/.test(s)) return 'red';
    if (/later|planned|idea/.test(s)) return 'violet';
    return 'grey';
  }
  // Back-compat + test hook + a stable data surface for the buckets.
  WP.execStatus = { statusColorKey: statusColorKey };
  WP.execStatusColorKey = statusColorKey;
  // Presentational colour tokens for each bucket (view-owned). Resolve to
  // tokens.css --exec-* vars, which hold the exact hexes the deck uses.
  const COLORS = {
    green:  'var(--exec-green)',  amber: 'var(--exec-amber)', red: 'var(--exec-red)',
    violet: 'var(--exec-violet)', grey:  'var(--exec-grey)',
  };

  // ---- relative time from an ISO string ("just now", "3h ago", "2d ago") -----
  function relTime(iso) {
    const t = WP.i18n.t;
    if (!iso) return '';
    const then = Date.parse(iso);
    if (isNaN(then)) return '';
    const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
    if (secs < 60) return t('execJustNow');
    const mins = Math.round(secs / 60);
    if (mins < 60) return mins + t('execMinAgo');
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return hrs + t('execHrAgo');
    const days = Math.round(hrs / 24);
    return days + t('execDayAgo');
  }

  // Cross-origin GET uses the shared ui-layer JSONP helper (WP.ui.jsonp) — the
  // transport lives in the ui layer (DOM-legal) and is reused, not buried here.
  // WHY JSONP: the Apps Script endpoint 302-redirects with no CORS headers, so
  // fetch() from GitHub Pages fails; a <script> tag is CORS-exempt.
  const loadJSONP = WP.ui.jsonp;

  // ---- small on-brand pieces --------------------------------------------------
  function dot(key) {
    return '<span class="ex-dot" style="background:' + COLORS[key] + '" aria-hidden="true"></span>';
  }
  function chip(raw) {
    const key = statusColorKey(raw);
    const label = ui.esc(String(raw || '—'));
    return '<span class="ex-chip ex-chip--' + key + '">' + label + '</span>';
  }
  function splitInside(s) {
    return String(s || '').split(/[,;•·\n]+/).map(function (x) { return x.trim(); })
      .filter(Boolean).slice(0, 6);
  }

  // ---- section builders -------------------------------------------------------
  function coverHTML(cover) {
    const t = WP.i18n.t;
    const c = cover || {};
    const done = +c.done || 0, next = +c.next || 0, later = +c.later || 0;
    const total = +c.total || 0;
    const pct = (c.pct != null && !isNaN(+c.pct)) ? Math.round(+c.pct)
      : (total ? Math.round((done / total) * 100) : 0);
    const w = function (n) { return total ? (n / total * 100) : 0; };
    const tile = function (label, val, cls) {
      return '<div class="ex-tile ' + cls + '"><div class="ex-tile-v">' + val + '</div>' +
        '<div class="ex-tile-l">' + label + '</div></div>';
    };
    return '<div class="section ex-cover">' +
      '<div class="ex-tiles">' +
        tile(t('execShipped'), done, 'is-green') +
        tile(t('execInProgress'), next, 'is-amber') +
        tile(t('execPlanned'), later, 'is-grey') +
        tile(t('execTotalWaves'), total, 'is-ink') +
      '</div>' +
      '<div class="ex-pct-wrap">' +
        '<div class="ex-pct"><span class="ex-pct-n">' + pct + '%</span> <span class="ex-pct-l">' + t('execDelivered') + '</span></div>' +
        '<div class="ex-bar" role="img" aria-label="' + pct + '% ' + t('execDelivered') + '">' +
          '<span style="width:' + w(done) + '%;background:' + COLORS.green + '"></span>' +
          '<span style="width:' + w(next) + '%;background:' + COLORS.amber + '"></span>' +
          '<span style="width:' + Math.max(0, w(total - done - next)) + '%;background:' + COLORS.grey + '"></span>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  // sort order red -> amber -> green -> grey (violet lands with grey tail)
  const RANK = { red: 0, amber: 1, green: 2, violet: 3, grey: 4 };
  function requestsHTML(requests) {
    const t = WP.i18n.t;
    const list = (requests || []).slice();
    if (!list.length) {
      return '<div class="section"><h3 class="ex-h3">' + t('execYourRequests') + '</h3>' +
        '<div class="ex-empty">' + t('execNoRequests') + '</div></div>';
    }
    const keyed = list.map(function (r) { return { r: r, k: statusColorKey(r.status) }; });
    let done = 0, prog = 0, need = 0;
    keyed.forEach(function (x) {
      if (x.k === 'green') done++;
      else if (x.k === 'amber') prog++;
      else if (x.k === 'red') need++;
    });
    keyed.sort(function (a, b) { return (RANK[a.k] - RANK[b.k]); });
    const shown = keyed.slice(0, 12);
    const rows = shown.map(function (x) {
      const r = x.r;
      const area = ui.esc(r.area || '—');
      const note = ui.esc(r.note || '');
      const pri = r.priority ? '<span class="ex-pri">' + ui.esc(r.priority) + '</span>' : '';
      return '<div class="ex-row">' + dot(x.k) +
        '<div class="ex-row-main"><span class="ex-row-area">' + area + '</span>' +
          (note ? ' <span class="ex-row-note">' + note + '</span>' : '') + '</div>' +
        chip(r.status) + pri +
      '</div>';
    }).join('');
    const more = keyed.length > 12
      ? '<div class="ex-more">+' + (keyed.length - 12) + ' ' + t('execMore') + '</div>' : '';
    const roll = t('execRaised').replace('{n}', list.length).replace('{m}', done)
      .replace('{k}', prog).replace('{j}', need);
    return '<div class="section">' +
      '<h3 class="ex-h3">' + t('execYourRequests') + '</h3>' +
      '<div class="ex-roll">' + roll + '</div>' +
      '<div class="ex-rows">' + rows + more + '</div>' +
    '</div>';
  }

  function wavesHTML(waves) {
    const t = WP.i18n.t;
    const list = (waves || []);
    if (!list.length) {
      return '<div class="section"><h3 class="ex-h3">' + t('execWaves') + '</h3>' +
        '<div class="ex-empty">' + t('execNoWaves') + '</div></div>';
    }
    const cards = list.map(function (wv) {
      const title = ui.esc(wv.wave || '—') + (wv.focus ? ' <span class="ex-wave-focus">' + ui.esc(wv.focus) + '</span>' : '');
      const inside = splitInside(wv.inside);
      const insideHTML = inside.length
        ? '<ul class="ex-inside">' + inside.map(function (i) {
            return '<li>' + ui.icon('check', 13) + ' ' + ui.esc(i) + '</li>';
          }).join('') + '</ul>' : '';
      const why = wv.why ? '<div class="ex-why">' + ui.esc(wv.why) + '</div>' : '';
      return '<div class="ex-wave">' +
        '<div class="ex-wave-head"><div class="ex-wave-title">' + title + '</div>' + chip(wv.status) + '</div>' +
        insideHTML + why +
      '</div>';
    }).join('');
    return '<div class="section"><h3 class="ex-h3">' + t('execWaves') + '</h3>' +
      '<div class="ex-waves">' + cards + '</div></div>';
  }

  // "What needs you" — derived from requests[] whose status is red (needs input),
  // PLUS "New" and "In review". NOT from waves[].needs.
  function needsHTML(requests) {
    const t = WP.i18n.t;
    const list = (requests || []).filter(function (r) {
      const s = String(r.status || '').toLowerCase();
      return statusColorKey(r.status) === 'red' || /\bnew\b/.test(s) || /in.?review/.test(s);
    });
    if (!list.length) {
      return '<div class="section ex-clear">' + ui.icon('check', 18) +
        ' <span>' + t('execAllClear') + '</span></div>';
    }
    const items = list.map(function (r) {
      const note = ui.esc(r.note || '—');
      const from = r.area ? ' <span class="ex-need-from">' + t('execFrom') + ' ' + ui.esc(r.area) + '</span>' : '';
      return '<div class="ex-need">' + dot('red') + '<div class="ex-need-b">' + note + from + '</div></div>';
    }).join('');
    return '<div class="section">' +
      '<h3 class="ex-h3">' + t('execNeedsYou') + '</h3>' +
      '<div class="ex-needs">' + items + '</div>' +
    '</div>';
  }

  // ---- header (always present: title, updated-time, refresh, open/present) ----
  function headerHTML(generatedAt) {
    const t = WP.i18n.t;
    const openUrl = ui.esc((WP.config.execDeckUrl || '').trim());
    const updated = generatedAt
      ? '<span class="ex-updated">' + t('execUpdated') + ' ' + ui.esc(relTime(generatedAt)) + '</span>' : '';
    const openBtn = openUrl
      ? '<a class="btn" id="exec-open" href="' + openUrl + '" target="_blank" rel="noopener noreferrer">' +
          ui.icon('external', 15) + ' <span>' + t('execOpen') + '</span></a>' : '';
    return '<div class="ex-head">' +
      '<div class="ex-head-t">' +
        '<div class="ex-eyebrow">' + t('execEyebrow') + '</div>' +
        '<h2 class="ex-title">' + t('execStatus') + '</h2>' +
        updated +
      '</div>' +
      '<div class="ex-head-actions">' +
        '<button type="button" class="btn" id="exec-refresh">' + ui.icon('arrowRight', 15) +
          ' <span>' + t('execRefresh') + '</span></button>' +
        openBtn +
      '</div>' +
    '</div>';
  }

  function skeleton() {
    return '<div class="section ex-skel"><div class="ex-skel-tiles">' +
      '<span></span><span></span><span></span><span></span></div>' +
      '<div class="ex-skel-bar"></div></div>' +
      '<div class="section ex-skel"><div class="ex-skel-line"></div><div class="ex-skel-line"></div>' +
      '<div class="ex-skel-line"></div></div>';
  }

  function errorHTML() {
    const t = WP.i18n.t;
    return '<div class="section ex-error">' + ui.icon('alert', 20) +
      '<div style="margin-top:8px">' + t('execError') + '</div>' +
      '<button type="button" class="btn primary" id="exec-retry" style="margin-top:12px">' +
        t('execRetry') + '</button></div>';
  }

  // ---- orchestration ----------------------------------------------------------
  let token = 0;   // guards against a stale JSONP resolving after a re-render

  function paintBody(host, data) {
    // Order is deliberate for a director scan (top = most decision-critical):
    // 1) cover rollup, 2) WHAT NEEDS YOU (the ask blocked on them — surfaced
    // high, not buried), 3) your requests, 4) waves detail.
    const body = coverHTML(data.cover) + needsHTML(data.requests) +
      requestsHTML(data.requests) + wavesHTML(data.waves);
    const bodyEl = host.querySelector('.ex-body');
    if (bodyEl) bodyEl.innerHTML = body;
    // refresh the "updated" stamp with the payload's generatedAt
    const headEl = host.querySelector('.ex-head');
    if (headEl && data.generatedAt) {
      const oldU = headEl.querySelector('.ex-updated');
      const html = '<span class="ex-updated">' + WP.i18n.t('execUpdated') + ' ' + ui.esc(relTime(data.generatedAt)) + '</span>';
      if (oldU) oldU.outerHTML = html;
      else headEl.querySelector('.ex-head-t').insertAdjacentHTML('beforeend', html);
    }
  }

  function paintError(host) {
    const bodyEl = host.querySelector('.ex-body');
    if (bodyEl) bodyEl.innerHTML = errorHTML();
    const retry = host.querySelector('#exec-retry');
    if (retry) retry.onclick = function () { load(host); };
  }

  function load(host) {
    const my = ++token;
    const bodyEl = host.querySelector('.ex-body');
    if (bodyEl) bodyEl.innerHTML = skeleton();
    const url = (WP.config.execStatusEndpoint || '').trim();
    if (!url) { paintError(host); return; }
    loadJSONP(url).then(function (data) {
      if (my !== token) return;                 // superseded by a newer load
      if (!data || data.ok === false) { paintError(host); return; }
      paintBody(host, data);
    }).catch(function () {
      if (my !== token) return;
      paintError(host);
    });
  }

  function render(root) {
    // Defence in depth — never render for a viewer who shouldn't see it, and
    // never render when no live endpoint is configured.
    if (!WP.execDeckVisible || !WP.execDeckVisible()) { WP.setState({ route: 'dashboard' }); return; }

    root.innerHTML = headerHTML(null) + '<div class="ex-body">' + skeleton() + '</div>';

    const refresh = root.querySelector('#exec-refresh');
    if (refresh) refresh.onclick = function () { load(root); };

    load(root);
  }

  WP.ui = WP.ui || {};
  WP.ui.exec = { render: render };
})(window.WP = window.WP || {});
