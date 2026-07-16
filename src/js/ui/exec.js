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
  // Status icon per bucket — so status is conveyed by SHAPE + colour, never
  // colour alone (a11y: color-blind users). Pairs with the chip's text label.
  const BUCKET_ICON = { green: 'check', amber: 'clock', red: 'alert', violet: 'clock', grey: 'minus' };
  function statusIcon(key) {
    return '<span class="ex-sic ex-sic--' + key + '" aria-hidden="true">' + ui.icon(BUCKET_ICON[key] || 'minus', 13) + '</span>';
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

  // ---- TIMELINE (senior-BA/PM view): a calendar-style WEEK NAVIGATOR ----------
  // The director can step to ANY week (‹ prev · "Week of 8–14 Jun" · next ›) and
  // snap back with Today, or switch to "All" to see every dated item grouped by
  // week. Time-navigator pattern: ONE reference (refWeekOffset, 0 = current week)
  // drives the window; the label always names the exact week so he never loses
  // his place. Reads a date per item from the sheet (requests[].date;
  // features[].date/reviewed). Undated items surface in a labelled "No date yet"
  // group (All view) so nothing is silently hidden.
  const TL_MODES = ['week', 'all'];

  // Monday-based week window for a given offset (0 = this week, -1 = last, +1 = next).
  function weekWindow(offset) {
    const now = new Date();
    const day = (now.getUTCDay() + 6) % 7;   // 0 = Monday
    const monday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day) + offset * 7 * 86400000;
    return { start: monday, end: monday + 7 * 86400000 - 1 };
  }
  function inWindow(ms, win) { return ms >= win.start && ms <= win.end; }

  // Human label for a week window, e.g. "8–14 Jun 2026" / "29 Jun – 5 Jul 2026".
  // Numbers/months stay LTR-friendly; formatting is locale-aware via toLocaleDateString.
  function weekLabel(win) {
    const loc = (WP.state && WP.state.lang === 'ar') ? 'ar' : 'en-GB';
    const a = new Date(win.start), b = new Date(win.end);
    const day = { day: 'numeric', timeZone: 'UTC' };
    const dayMon = { day: 'numeric', month: 'short', timeZone: 'UTC' };
    const full = { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' };
    const sameMonth = a.getUTCMonth() === b.getUTCMonth() && a.getUTCFullYear() === b.getUTCFullYear();
    const left = sameMonth ? a.toLocaleDateString(loc, day) : a.toLocaleDateString(loc, dayMon);
    return left + ' – ' + b.toLocaleDateString(loc, full);
  }

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
    return '<div class="ex-tl-row">' + statusIcon(k) +
      '<span class="ex-tl-title">' + ui.esc(it.title) + '</span>' + chip(it.status) + '</div>';
  }

  // Navigator control: [Week | All] granularity segment + (in Week mode) the
  // ‹ prev · "Week of …" · next › stepper and a Today button. label is aria-live
  // so screen readers announce the week on change.
  function navHTML(mode, offset) {
    const t = WP.i18n.t;
    const seg = TL_MODES.map(function (m) {
      const on = m === mode ? ' is-on' : '';
      const label = m === 'week' ? t('execWeekView') : t('execAllView');
      return '<button type="button" class="ex-seg-btn' + on + '" data-mode="' + m + '" aria-pressed="' + (on ? 'true' : 'false') + '">' + label + '</button>';
    }).join('');
    let stepper = '';
    if (mode === 'week') {
      const isNow = offset === 0;
      const label = weekLabel(weekWindow(offset));
      stepper =
        '<div class="ex-step">' +
          '<button type="button" class="ex-step-btn ex-step-prev" data-step="-1" aria-label="' + t('execPrevWeek') + '">' + ui.icon('chevronLeft', 16) + '</button>' +
          '<span class="ex-step-label" aria-live="polite">' + ui.esc(label) + '</span>' +
          '<button type="button" class="ex-step-btn ex-step-next" data-step="1" aria-label="' + t('execNextWeek') + '">' + ui.icon('chevronRight', 16) + '</button>' +
          '<button type="button" class="ex-step-today btn' + (isNow ? ' is-now' : '') + '" data-today="1"' + (isNow ? ' disabled' : '') + '>' + t('execToday') + '</button>' +
        '</div>';
    }
    return '<div class="ex-seg" role="group" aria-label="' + t('execTimeline') + '">' + seg + '</div>' + stepper;
  }

  function timelineHTML(data, mode, offset) {
    const t = WP.i18n.t;
    const items = timelineItems(data);
    const dated = items.map(function (it) { return { it: it, ms: it.date ? Date.parse(it.date) : NaN }; });

    let groups;
    if (mode === 'all') {
      // group every dated item by week around the current week (±), plus undated.
      const buckets = {};
      dated.forEach(function (x) {
        if (isNaN(x.ms)) { (buckets.__undated = buckets.__undated || []).push(x); return; }
        // find its week offset relative to now
        const base = weekWindow(0).start;
        const off = Math.floor((x.ms - base) / (7 * 86400000));
        (buckets[off] = buckets[off] || []).push(x);
      });
      const offs = Object.keys(buckets).filter(function (k) { return k !== '__undated'; })
        .map(Number).sort(function (a, b) { return b - a; });   // newest week first
      groups = offs.map(function (o) { return { label: weekLabel(weekWindow(o)), rows: buckets[o] }; });
      if (buckets.__undated) groups.push({ label: t('execUndated'), rows: buckets.__undated });
    } else {
      const win = weekWindow(offset);
      const rows = dated.filter(function (x) { return !isNaN(x.ms) && inWindow(x.ms, win); });
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
        '<div class="ex-tl-nav">' + navHTML(mode, offset) + '</div></div>' +
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
      return '<div class="ex-need">' + statusIcon('red') + '<div class="ex-need-b">' + note + from + '</div></div>';
    }).join('');
    return '<div class="section">' +
      '<h3 class="ex-h3">' + t('execNeedsYou') + '</h3>' +
      '<div class="ex-needs">' + items + '</div>' +
    '</div>';
  }

  // Freshness indicator (system-status visibility, Heuristic #1) tuned for the
  // stale-while-revalidate model: data auto-refreshes in the background, so there
  // is NO manual Refresh button. Per UX best practice for SWR (NN/g; web.dev), we
  // do NOT stamp "updated just now" on every load — that is false precision/noise.
  // Instead: a calm green "Live" dot when the data is current; it degrades to an
  // honest "Updated Xm ago" (amber) only once the payload ages past a threshold.
  // The exact age is always available on hover for anyone who wants it.
  const STALE_MS = 10 * 60 * 1000;   // >10 min old => surface the age, not just "Live"
  function freshnessHTML(generatedAt) {
    const t = WP.i18n.t;
    if (!generatedAt) return '';
    const age = Date.now() - Date.parse(generatedAt);
    const stale = isNaN(age) ? false : age > STALE_MS;
    const label = stale ? (t('execUpdated') + ' ' + relTime(generatedAt)) : t('execLive');
    return '<span class="ex-fresh' + (stale ? ' is-stale' : '') + '" ' +
      'title="' + ui.esc(t('execUpdated') + ' ' + relTime(generatedAt)) + '">' +
      '<span class="ex-fresh-dot" aria-hidden="true"></span>' +
      '<span class="ex-fresh-txt">' + ui.esc(label) + '</span>' +
    '</span>';
  }

  // ---- header (always present: eyebrow, title, subtitle, freshness) ----
  function headerHTML(generatedAt) {
    const t = WP.i18n.t;
    return '<div class="ex-head">' +
      '<div class="ex-head-t">' +
        '<div class="ex-eyebrow">' + t('execEyebrow') + '</div>' +
        '<h2 class="ex-title">' + t('execStatus') + '</h2>' +
        '<p class="ex-forwho">' + t('execForWho') + '</p>' +
        freshnessHTML(generatedAt) +
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
  let tlMode = 'week';   // 'week' (stepper) | 'all' (every week grouped) — view-local
  let refWeekOffset = 0; // current week = 0; ‹prev = -1, next› = +1 … (time-navigator reference)
  let lastData = null;   // last payload (so a nav change repaints without refetch)
  // Module-level cache so re-entering the view is INSTANT (stale-while-revalidate).
  // The Apps Script endpoint is slow (cold start + a 302 redirect, several seconds),
  // and it was refetched from scratch on every visit. Now: paint the cached payload
  // immediately, then silently revalidate in the background. Lives for the session.
  let cache = null;      // { data, at } — last good payload + when we fetched it (ms)

  function paintBody(host, data) {
    lastData = data;
    cache = { data: data, at: Date.now() };   // remember for an instant re-entry
    // Order for a director/PM scan: 1) compact launcher (summary + open deck),
    // 2) TIMELINE (what shipped / is coming, by week), 3) WHAT NEEDS YOU.
    const body = launcherHTML(data) + timelineHTML(data, tlMode, refWeekOffset) + needsHTML(data.requests);
    const bodyEl = host.querySelector('.ex-body');
    if (bodyEl) bodyEl.innerHTML = body;
    wireBody(host);
    // refresh the freshness indicator with the payload's generatedAt
    const headEl = host.querySelector('.ex-head');
    if (headEl && data.generatedAt) {
      const oldF = headEl.querySelector('.ex-fresh');
      const html = freshnessHTML(data.generatedAt);
      if (oldF) oldF.outerHTML = html;
      else if (html) headEl.querySelector('.ex-head-t').insertAdjacentHTML('beforeend', html);
    }
  }

  // Repaint ONLY the timeline section in place from lastData (no refetch), then
  // re-wire. Keeps focus off WP.state — this is view-local navigation.
  function repaintTimeline(host) {
    if (!lastData) return;
    const cur = host.querySelector('.ex-tl-head') && host.querySelector('.ex-tl-head').closest('.section');
    if (cur) { cur.outerHTML = timelineHTML(lastData, tlMode, refWeekOffset); wireBody(host); }
  }

  // Wire the navigator: [Week|All] segment, ‹ prev / next ›, and Today. A change
  // repaints the timeline from lastData. Purely view-local; nothing touches WP.state.
  function wireBody(host) {
    host.querySelectorAll('[data-mode]').forEach(function (b) {
      b.onclick = function () {
        tlMode = b.getAttribute('data-mode');
        if (tlMode === 'week' && isNaN(refWeekOffset)) refWeekOffset = 0;
        repaintTimeline(host);
      };
    });
    host.querySelectorAll('[data-step]').forEach(function (b) {
      b.onclick = function () {
        refWeekOffset += parseInt(b.getAttribute('data-step'), 10) || 0;
        repaintTimeline(host);
      };
    });
    const today = host.querySelector('[data-today]');
    if (today) today.onclick = function () { refWeekOffset = 0; repaintTimeline(host); };
  }

  function paintError(host) {
    const bodyEl = host.querySelector('.ex-body');
    if (bodyEl) bodyEl.innerHTML = errorHTML();
    const retry = host.querySelector('#exec-retry');
    if (retry) retry.onclick = function () { load(host); };
  }

  // Fetch the live payload. When `background` is true we already have content on
  // screen (cached), so we DON'T blank it with a skeleton and we DON'T show an
  // error if the silent revalidation fails — the user keeps the good cached view.
  function load(host, background) {
    const my = ++token;
    const bodyEl = host.querySelector('.ex-body');
    if (bodyEl && !background) bodyEl.innerHTML = skeleton();
    const url = (WP.config.execStatusEndpoint || '').trim();
    if (!url) { if (!background) paintError(host); return; }
    loadJSONP(url).then(function (data) {
      if (my !== token) return;                 // superseded by a newer load
      if (!data || data.ok === false) { if (!background) paintError(host); return; }
      paintBody(host, data);
    }).catch(function () {
      if (my !== token) return;
      if (!background) paintError(host);         // silent on a background refresh
    });
  }

  function render(root) {
    // Defence in depth — never render for a viewer who shouldn't see it, and
    // never render when no live endpoint is configured.
    if (!WP.execDeckVisible || !WP.execDeckVisible()) { WP.setState({ route: 'dashboard' }); return; }

    // Stale-while-revalidate: if we have a cached payload from earlier this
    // session, paint it INSTANTLY (no skeleton, no waiting on the slow endpoint),
    // then revalidate quietly in the background. Cold first load shows the skeleton.
    if (cache) {
      root.innerHTML = headerHTML(cache.data.generatedAt) + '<div class="ex-body"></div>';
      paintBody(root, cache.data);
      load(root, true);                          // silent background refresh
    } else {
      root.innerHTML = headerHTML(null) + '<div class="ex-body">' + skeleton() + '</div>';
      load(root, false);
    }
  }

  WP.ui = WP.ui || {};
  // _resetCache: clears the session SWR cache so a cold load can be exercised
  // deterministically (used by verify-exec; harmless in the app).
  WP.ui.exec = { render: render, _resetCache: function () { cache = null; lastData = null; } };
})(window.WP = window.WP || {});
