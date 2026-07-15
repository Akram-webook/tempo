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

  // ---- section builders -------------------------------------------------------
  // Compact LAUNCHER — a small summary + % bar + one-line rollup + a big button
  // to the full Google Slides deck (the hosted, presentable artifact). The page
  // no longer duplicates the full slide-by-slide render; the deck owns that.
  function launcherHTML(data) {
    const t = WP.i18n.t;
    const c = (data && data.cover) || {};
    const done = +c.done || 0, next = +c.next || 0, later = +c.later || 0;
    const total = +c.total || 0;
    const pct = (c.pct != null && !isNaN(+c.pct)) ? Math.round(+c.pct)
      : (total ? Math.round((done / total) * 100) : 0);
    const w = function (n) { return total ? (n / total * 100) : 0; };
    // needs-count from the live requests (red bucket) for the rollup
    const need = ((data && data.requests) || []).filter(function (r) { return statusColorKey(r.status) === 'red'; }).length;
    const summary = t('execSummary').replace('{done}', done).replace('{next}', next).replace('{need}', need);
    const openUrl = ui.esc((WP.config.execDeckUrl || '').trim());
    const openBtn = openUrl
      ? '<a class="btn primary ex-deck-btn" id="exec-open" href="' + openUrl + '" target="_blank" rel="noopener noreferrer">' +
          ui.icon('external', 16) + ' <span>' + t('execOpenDeck') + '</span></a>' : '';
    return '<div class="section ex-launch">' +
      '<div class="ex-launch-top">' +
        '<div class="ex-pct"><span class="ex-pct-n">' + pct + '%</span> <span class="ex-pct-l">' + t('execDelivered') + '</span></div>' +
        openBtn +
      '</div>' +
      '<div class="ex-bar" role="img" aria-label="' + pct + '% ' + t('execDelivered') + '">' +
        '<span style="width:' + w(done) + '%;background:' + COLORS.green + '"></span>' +
        '<span style="width:' + w(next) + '%;background:' + COLORS.amber + '"></span>' +
        '<span style="width:' + Math.max(0, w(total - done - next)) + '%;background:' + COLORS.grey + '"></span>' +
      '</div>' +
      '<div class="ex-launch-sum">' + summary + '</div>' +
    '</div>';
  }

  // ---- TIMELINE (senior-BA/PM view): items grouped into week buckets by date --
  // Reads a date per item from the sheet (requests[].date; features[].date/reviewed
  // when present). Filter: This week / Last week / Upcoming / All. Undated items
  // fall into a clearly-labelled "No date yet" group so nothing is silently hidden.
  const TL_FILTERS = ['thisWeek', 'lastWeek', 'upcoming', 'all'];

  // Monday-based week window for a given offset (0 = this week, -1 = last, +1 = next).
  function weekWindow(offset) {
    const now = new Date();
    const day = (now.getUTCDay() + 6) % 7;   // 0 = Monday
    const monday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day) + offset * 7 * 86400000;
    return { start: monday, end: monday + 7 * 86400000 - 1 };
  }
  function inWindow(ms, win) { return ms >= win.start && ms <= win.end; }

  // Normalize the timeline items from the payload (requests + any dated features).
  function timelineItems(data) {
    const out = [];
    ((data && data.requests) || []).forEach(function (r) {
      out.push({ title: (r.area ? r.area + ' — ' : '') + (r.note || '—'), status: r.status, date: r.date || null });
    });
    ((data && data.features) || []).forEach(function (f) {
      const d = f.date || f.Reviewed || f.reviewed || null;
      const title = (f.area || f.Area || '') ? ((f.area || f.Area) + ' — ' + (f.feature || f.Feature || '')) : (f.feature || f.Feature || '');
      if (title) out.push({ title: title, status: f.status || f.Status, date: d });
    });
    return out;
  }

  function tlRow(it) {
    const k = statusColorKey(it.status);
    return '<div class="ex-tl-row">' + dot(k) +
      '<span class="ex-tl-title">' + ui.esc(it.title) + '</span>' + chip(it.status) + '</div>';
  }

  function timelineHTML(data, filter) {
    const t = WP.i18n.t;
    const items = timelineItems(data);
    const tabs = TL_FILTERS.map(function (f) {
      const on = f === filter ? ' is-on' : '';
      const label = f === 'thisWeek' ? t('execThisWeek') : f === 'lastWeek' ? t('execLastWeek')
        : f === 'upcoming' ? t('execUpcoming') : t('execAll');
      return '<button type="button" class="ex-tl-tab' + on + '" data-tl="' + f + '" aria-pressed="' + (on ? 'true' : 'false') + '">' + label + '</button>';
    }).join('');

    // bucket by the active filter
    const dated = items.map(function (it) { return { it: it, ms: it.date ? Date.parse(it.date) : NaN }; });
    let groups;
    if (filter === 'all') {
      groups = [
        { label: t('execLastWeek'), rows: dated.filter(function (x) { return !isNaN(x.ms) && inWindow(x.ms, weekWindow(-1)); }) },
        { label: t('execThisWeek'), rows: dated.filter(function (x) { return !isNaN(x.ms) && inWindow(x.ms, weekWindow(0)); }) },
        { label: t('execUpcoming'), rows: dated.filter(function (x) { return !isNaN(x.ms) && x.ms > weekWindow(0).end; }) },
        { label: t('execUndated'), rows: dated.filter(function (x) { return isNaN(x.ms); }) },
      ].filter(function (g) { return g.rows.length; });
    } else {
      const win = filter === 'thisWeek' ? weekWindow(0) : filter === 'lastWeek' ? weekWindow(-1) : null;
      const rows = filter === 'upcoming'
        ? dated.filter(function (x) { return !isNaN(x.ms) && x.ms > weekWindow(0).end; })
        : dated.filter(function (x) { return !isNaN(x.ms) && inWindow(x.ms, win); });
      groups = rows.length ? [{ label: null, rows: rows }] : [];
    }

    const body = groups.length
      ? groups.map(function (g) {
          return (g.label ? '<div class="ex-tl-group">' + ui.esc(g.label) + '</div>' : '') +
            g.rows.map(function (x) { return tlRow(x.it); }).join('');
        }).join('')
      : '<div class="ex-empty">' + t('execTlEmpty') + '</div>';

    return '<div class="section">' +
      '<div class="ex-tl-head"><h3 class="ex-h3">' + t('execTimeline') + '</h3>' +
        '<div class="ex-tl-tabs" role="group" aria-label="' + t('execTimeline') + '">' + tabs + '</div></div>' +
      '<div class="ex-tl-body">' + body + '</div>' +
    '</div>';
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
    const updated = generatedAt
      ? '<span class="ex-updated">' + t('execUpdated') + ' ' + ui.esc(relTime(generatedAt)) + '</span>' : '';
    return '<div class="ex-head">' +
      '<div class="ex-head-t">' +
        '<div class="ex-eyebrow">' + t('execEyebrow') + '</div>' +
        '<h2 class="ex-title">' + t('execStatus') + '</h2>' +
        '<p class="ex-forwho">' + t('execForWho') + '</p>' +
        updated +
      '</div>' +
      '<div class="ex-head-actions">' +
        '<button type="button" class="btn" id="exec-refresh">' + ui.icon('arrowRight', 15) +
          ' <span>' + t('execRefresh') + '</span></button>' +
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
  let token = 0;         // guards against a stale JSONP resolving after a re-render
  let tlFilter = 'thisWeek';   // timeline filter (view-local; defaults to the current week)
  let lastData = null;   // last payload (so a filter change repaints without refetch)

  function paintBody(host, data) {
    lastData = data;
    // Order for a director/PM scan: 1) compact launcher (summary + open deck),
    // 2) TIMELINE (what shipped / is coming, by week), 3) WHAT NEEDS YOU.
    const body = launcherHTML(data) + timelineHTML(data, tlFilter) + needsHTML(data.requests);
    const bodyEl = host.querySelector('.ex-body');
    if (bodyEl) bodyEl.innerHTML = body;
    wireBody(host);
    // refresh the "updated" stamp with the payload's generatedAt
    const headEl = host.querySelector('.ex-head');
    if (headEl && data.generatedAt) {
      const oldU = headEl.querySelector('.ex-updated');
      const html = '<span class="ex-updated">' + WP.i18n.t('execUpdated') + ' ' + ui.esc(relTime(data.generatedAt)) + '</span>';
      if (oldU) oldU.outerHTML = html;
      else headEl.querySelector('.ex-head-t').insertAdjacentHTML('beforeend', html);
    }
  }

  // Wire the timeline filter tabs — a filter change repaints from lastData (no
  // refetch). Purely view-local state; nothing touches WP.state.
  function wireBody(host) {
    host.querySelectorAll('[data-tl]').forEach(function (b) {
      b.onclick = function () {
        tlFilter = b.getAttribute('data-tl');
        const tlBody = host.querySelector('.ex-body');
        if (tlBody && lastData) {
          // repaint only the timeline section in place
          const sec = timelineHTML(lastData, tlFilter);
          const cur = host.querySelector('.ex-tl-head') && host.querySelector('.ex-tl-head').closest('.section');
          if (cur) { cur.outerHTML = sec; wireBody(host); }
        }
      };
    });
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
