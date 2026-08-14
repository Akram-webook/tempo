/* ============================================================
 * Tempo — Events Sales (director dashboard)
 * ------------------------------------------------------------
 * A one-glance director view over the sample sales dataset, with a global filter
 * bar (range + sports/entertainment + client) that drives every panel at once:
 *
 *   • KPI cards with prior-period trend arrows (momentum, not just totals).
 *   • Revenue/Events trend — an inline-SVG area + line graph (metric toggle).
 *   • Two donuts: sports vs entertainment, and cashless vs on-ground.
 *   • Top clients — a horizontal bar ranking (RTL-aware, CSS).
 *   • Detailed per-client table (search + sort), and anti-fraud reporting.
 *
 * Presentation only: aggregation lives in the pure WP.sales engine. Charts are
 * hand-built SVG/CSS (no chart library — architecture lock) and theme/RTL aware.
 * Director/admin-gated (WP.sales.canView) with a defence-in-depth re-check here.
 * ========================================================== */
(function (WP) {
  'use strict';
  var ui = WP.ui;
  var esc = function (s) { return ui.esc(String(s == null ? '' : s)); };

  // View-local state (not persisted to WP.state — purely presentational).
  // range is a preset month count (3/6/12) OR the string 'custom', in which case
  // from/to bound an explicit month window (data is monthly, so the date filter
  // is month-granular). from/to are month keys ('YYYY-MM') drawn from the dataset.
  var filter = { range: 6, category: 'all', orgId: 'all', from: null, to: null };
  var trendMetric = 'revenue';   // 'revenue' | 'events'

  function loc() { return (WP.state && WP.state.lang === 'ar') ? 'ar-SA' : 'en'; }
  function orgLabel(o) { return WP.state && WP.state.lang === 'ar' ? (o.nameAr || o.name) : o.name; }

  // ---- formatting helpers (locale + SAR) --------------------------------------
  function fmtNum(n) {
    try { return new Intl.NumberFormat(loc()).format(Math.round(n || 0)); }
    catch (e) { return String(Math.round(n || 0)); }
  }
  function fmtSAR(n) {
    try { return new Intl.NumberFormat(loc(), { style: 'currency', currency: 'SAR', maximumFractionDigits: 0 }).format(Math.round(n || 0)); }
    catch (e) { return 'SAR ' + fmtNum(n); }
  }
  function fmtSARc(n) {
    try { return new Intl.NumberFormat(loc(), { style: 'currency', currency: 'SAR', notation: 'compact', maximumFractionDigits: 1 }).format(Math.round(n || 0)); }
    catch (e) { return fmtSAR(n); }
  }
  function fmtMonth(m, opts) {
    var parts = String(m || '').split('-');
    var y = +parts[0], mo = +parts[1];
    if (!y || !mo) return String(m || '');
    try {
      return new Intl.DateTimeFormat(loc(), opts || { month: 'short', year: '2-digit', timeZone: 'UTC' })
        .format(new Date(Date.UTC(y, mo - 1, 1)));
    } catch (e) { return m; }
  }

  // Resolve the active month window. Custom mode returns the inclusive slice
  // between from/to; every failure mode falls back to a safe contiguous window
  // so a bad/partial custom selection can never produce a broken range:
  //   • from or to missing / not in the dataset  → default 6-month tail
  //   • from later than to (inverted)            → transparently swapped
  //   • from === to                              → a single valid month
  function selectedMonths() {
    var all = WP.sales.months();
    if (filter.range === 'custom') {
      var i0 = all.indexOf(filter.from), i1 = all.indexOf(filter.to);
      if (i0 < 0 || i1 < 0) return all.slice(Math.max(0, all.length - 6));
      if (i0 > i1) { var tmp = i0; i0 = i1; i1 = tmp; }
      return all.slice(i0, i1 + 1);
    }
    var n = (typeof filter.range === 'number' && filter.range > 0) ? filter.range : 6;
    return all.slice(Math.max(0, all.length - n));
  }
  // Sensible default bounds when the user first switches into custom mode:
  // the last 6 months (matching the previous preset feel).
  function defaultCustomBounds() {
    var all = WP.sales.months();
    return { from: all[Math.max(0, all.length - 6)], to: all[all.length - 1] };
  }
  function opts() { return { category: filter.category, orgId: filter.orgId }; }
  function filterActive() { return filter.category !== 'all' || filter.orgId !== 'all'; }
  function rangeActive() { return filter.range === 'custom' || filter.range !== 6; }

  // Round a value up to a "nice" axis maximum (1/2/5 × 10^k).
  function niceCeil(v) {
    if (!v || v <= 0) return 1;
    var p = Math.pow(10, Math.floor(Math.log(v) / Math.LN10));
    var f = v / p;
    var nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
    return nf * p;
  }

  /* ---- Filter bar (range + category + client) -------------------------------- */
  function seg(key, cur, options) {
    return options.map(function (o) {
      var on = String(cur) === String(o.v) ? ' is-on' : '';
      return '<button type="button" class="sales-seg-btn' + on + '" data-' + key + '="' + esc(o.v) + '"' +
        ' aria-pressed="' + (on ? 'true' : 'false') + '">' + esc(o.l) + '</button>';
    }).join('');
  }
  function filterBarHTML() {
    var t = WP.i18n.t;
    // Client list follows the active category, so a contradictory combo
    // (e.g. Sports + an entertainment client) can't be picked from the UI.
    var clientList = WP.sales.orgs().filter(function (o) {
      return filter.category === 'all' || o.category === filter.category;
    });
    var clientOpts = '<option value="all">' + esc(t('salesAllClients')) + '</option>' +
      clientList.map(function (o) {
        return '<option value="' + esc(o.id) + '"' + (filter.orgId === o.id ? ' selected' : '') + '>' + esc(orgLabel(o)) + '</option>';
      }).join('');
    var reset = filterActive() || rangeActive()
      ? '<button type="button" class="sales-reset" data-reset="1">' + ui.icon('x', 14) + ' ' + esc(t('salesReset')) + '</button>' : '';
    // Custom From/To month pickers — only shown while the custom preset is active.
    var monthOpts = function (sel) {
      return WP.sales.months().map(function (m) {
        return '<option value="' + esc(m) + '"' + (sel === m ? ' selected' : '') + '>' +
          esc(fmtMonth(m, { month: 'short', year: 'numeric', timeZone: 'UTC' })) + '</option>';
      }).join('');
    };
    var customHTML = filter.range === 'custom'
      ? '<div class="sales-fgroup sales-custom"><span class="sales-flabel">' + esc(t('salesFrom')) + '</span>' +
          '<select class="sales-select sales-select--sm" data-from aria-label="' + esc(t('salesFrom')) + '">' + monthOpts(filter.from) + '</select>' +
          '<span class="sales-flabel">' + esc(t('salesTo')) + '</span>' +
          '<select class="sales-select sales-select--sm" data-to aria-label="' + esc(t('salesTo')) + '">' + monthOpts(filter.to) + '</select>' +
        '</div>' : '';
    // Compact, label-free bar: the controls are self-describing (chips read
    // "3 mo"/"Sports"; the select says "All clients"), so the redundant
    // Range/Category/Client labels are dropped — the bar fits one row and there
    // is less to scan (Hick's Law). Presets stay one-click; Custom reveals the
    // month pickers inline only when chosen.
    return '<div class="sales-filters">' +
      '<div class="sales-seg" role="group" aria-label="' + esc(t('salesRangeLabel')) + '">' +
        seg('range', filter.range, [{ v: 3, l: t('salesRangeShort').replace('{n}', 3) },
          { v: 6, l: t('salesRangeShort').replace('{n}', 6) }, { v: 12, l: t('salesRangeShort').replace('{n}', 12) },
          { v: 'custom', l: t('salesRangeCustom') }]) +
      '</div>' +
      customHTML +
      '<span class="sales-fsep" aria-hidden="true"></span>' +
      '<div class="sales-seg" role="group" aria-label="' + esc(t('salesColCategory')) + '">' +
        seg('cat', filter.category, [{ v: 'all', l: t('salesAll') },
          { v: 'sports', l: t('salesSports') }, { v: 'entertainment', l: t('salesEntertainment') }]) +
      '</div>' +
      '<select class="sales-select" data-client aria-label="' + esc(t('salesClient')) + '">' + clientOpts + '</select>' +
      reset +
    '</div>';
  }

  /* ---- KPI cards with prior-period delta -------------------------------------- */
  function deltaChip(cur, prev) {
    if (prev == null || prev === 0) return '';
    var d = Math.round(((cur - prev) / prev) * 100);
    var up = d >= 0;
    // One arrow glyph; CSS rotates it 180° for the down case (no arrowDown icon).
    return '<span class="sales-delta ' + (up ? 'is-up' : 'is-down') + '">' +
      ui.icon('arrowUp', 12) + ' ' + Math.abs(d) + '%</span>';
  }
  function kpi(label, value, sub, color, delta) {
    return '<div class="card"><div class="label">' + esc(label) + '</div>' +
      '<div class="value"' + (color ? ' style="color:' + color + '"' : '') + '>' + value + (delta || '') + '</div>' +
      '<div class="sub">' + (sub || '') + '</div></div>';
  }
  function kpisHTML(tot, prev, nMonths) {
    var t = WP.i18n.t;
    var perMo = nMonths ? Math.round(tot.events / nMonths) : 0;
    var vsPrev = t('salesVsPrev');
    // Exactly four headline KPIs — an even grid that fills its row at every
    // width (no orphan card / dead band). Active-client count moves to the Top
    // clients header, where it reads in context instead of as a lonely tile.
    return '<div class="metrics sales-kpis sales-kpis--4">' +
      kpi(t('salesKpiRevenue'), fmtSARc(tot.revenue), vsPrev, 'var(--brand-text)',
        deltaChip(tot.revenue, prev ? prev.revenue : null)) +
      kpi(t('salesKpiEvents'), fmtNum(tot.events),
        t('salesKpiEventsSub').replace('{n}', fmtNum(perMo)), null,
        deltaChip(tot.events, prev ? prev.events : null)) +
      kpi(t('salesKpiAvg'), fmtSARc(tot.avgPerEvent), vsPrev, null,
        deltaChip(tot.avgPerEvent, prev ? prev.avgPerEvent : null)) +
      kpi(t('salesKpiCashless'), tot.cashlessPct + '%', fmtSARc(tot.cashless), 'var(--exec-green)') +
    '</div>';
  }

  /* ---- Auto-insight strip — reads the numbers, tells the story --------------- */
  // A signed arrow chip built from a raw percentage (not a cur/prev pair).
  function signChip(pct) {
    var up = pct >= 0;
    return '<span class="sales-delta ' + (up ? 'is-up' : 'is-down') + '">' +
      ui.icon('arrowUp', 12) + ' ' + Math.abs(pct) + '%</span>';
  }
  function pctChange(cur, prev) {
    if (prev == null || prev === 0) return null;
    return Math.round(((cur - prev) / prev) * 100);
  }
  function insightCard(label, headline, sub) {
    return '<div class="sales-ins">' +
      '<div class="sales-ins-k">' + esc(label) + '</div>' +
      '<div class="sales-ins-h">' + headline + '</div>' +
      '<div class="sales-ins-s">' + sub + '</div></div>';
  }
  function insightsHTML(tot, prev, byOrgRows) {
    var t = WP.i18n.t;
    var cards = [];

    // 1) Momentum — revenue direction vs the equal prior window.
    var revPct = prev ? pctChange(tot.revenue, prev.revenue) : null;
    if (revPct != null) {
      cards.push(insightCard(t('salesInsMomentum'), signChip(revPct),
        t('salesInsVs').replace('{cur}', fmtSARc(tot.revenue)).replace('{prev}', fmtSARc(prev.revenue))));
    } else {
      cards.push(insightCard(t('salesInsMomentum'), fmtSARc(tot.revenue), esc(t('salesInsNewPeriod'))));
    }

    // 2) Main driver — did volume or per-event spend move revenue more?
    if (prev) {
      var evPct = pctChange(tot.events, prev.events) || 0;
      var avgPct = pctChange(tot.avgPerEvent, prev.avgPerEvent) || 0;
      var volDominates = Math.abs(evPct) >= Math.abs(avgPct);
      var mainPct = volDominates ? evPct : avgPct;
      var mainLbl = volDominates ? t('salesInsDriverVol') : t('salesInsDriverSpend');
      var otherPct = volDominates ? avgPct : evPct;
      var otherLbl = volDominates ? t('salesInsDriverSpend') : t('salesInsDriverVol');
      cards.push(insightCard(t('salesInsDriver'),
        signChip(mainPct) + ' <span class="sales-ins-h-t">' + esc(mainLbl) + '</span>',
        t('salesInsDriverSub').replace('{other}', (otherPct >= 0 ? '+' : '−') + Math.abs(otherPct) + '% ' + esc(otherLbl))));
    }

    // 3) Top client — headline name + share, flagged if concentration is high.
    var top = byOrgRows[0];
    if (top && tot.revenue) {
      var share = Math.round((top.revenue / tot.revenue) * 100);
      var risky = share >= 35;
      cards.push(insightCard(t('salesInsTopClient'),
        '<span class="sales-ins-name" title="' + esc(orgLabel(top)) + '">' + esc(orgLabel(top)) + '</span>',
        '<span class="sales-ins-share">' + share + '% ' + esc(t('salesInsOfRevenue')) + '</span>' +
        ' <span class="sales-tag ' + (risky ? 'is-warn' : 'is-ok') + '">' +
        esc(risky ? t('salesInsConcRisk') : t('salesInsConcOk')) + '</span>'));
    }

    // 4) Payment mix — cashless vs on-ground at a glance.
    cards.push(insightCard(t('salesInsMix'),
      tot.cashlessPct + '% <span class="sales-ins-h-t">' + esc(t('salesCashless')) + '</span>',
      tot.onGroundPct + '% ' + esc(t('salesOnGround'))));

    return '<div class="sales-insights" role="group" aria-label="' + esc(t('salesInsights')) + '">' + cards.join('') + '</div>';
  }

  /* ---- Revenue/Events trend — inline SVG area + line -------------------------- */
  function trendHTML(rows) {
    var t = WP.i18n.t;
    var isRev = trendMetric !== 'events';
    var color = isRev ? 'var(--brand)' : 'var(--wbk-blue)';
    var W = 760, H = 250, padL = 58, padR = 16, padT = 16, padB = 30;
    var plotW = W - padL - padR, plotH = H - padT - padB;
    var n = rows.length;
    var vals = rows.map(function (r) { return isRev ? r.revenue : r.events; });
    var maxV = niceCeil(Math.max.apply(null, vals.concat([0])));
    var X = function (i) { return n <= 1 ? padL + plotW / 2 : padL + i * (plotW / (n - 1)); };
    var Y = function (v) { return padT + plotH * (1 - (maxV ? v / maxV : 0)); };
    var grid = '', ylabels = '';
    for (var g = 0; g <= 4; g++) {
      var gv = maxV * g / 4, gy = Y(gv);
      grid += '<line class="sales-grid-line" x1="' + padL + '" y1="' + gy.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + gy.toFixed(1) + '"/>';
      ylabels += '<text class="sales-ax-y" x="' + (padL - 8) + '" y="' + (gy + 4).toFixed(1) + '">' + esc(isRev ? fmtSARc(gv) : fmtNum(gv)) + '</text>';
    }
    var linePts = rows.map(function (r, i) { return X(i).toFixed(1) + ',' + Y(isRev ? r.revenue : r.events).toFixed(1); }).join(' ');
    var areaPath = 'M' + X(0).toFixed(1) + ',' + (padT + plotH).toFixed(1) +
      ' L' + rows.map(function (r, i) { return X(i).toFixed(1) + ',' + Y(isRev ? r.revenue : r.events).toFixed(1); }).join(' L') +
      ' L' + X(n - 1).toFixed(1) + ',' + (padT + plotH).toFixed(1) + ' Z';
    var dots = rows.map(function (r, i) {
      var v = isRev ? r.revenue : r.events;
      var lab = fmtMonth(r.month, { month: 'long', year: 'numeric', timeZone: 'UTC' }) + ': ' +
        (isRev ? fmtSAR(v) : (fmtNum(v) + ' ' + t('salesEventsLabel')));
      return '<circle class="sales-pt" cx="' + X(i).toFixed(1) + '" cy="' + Y(v).toFixed(1) + '" r="3.5" fill="' + color + '"><title>' + esc(lab) + '</title></circle>';
    }).join('');
    var xlabels = rows.map(function (r, i) {
      return '<text class="sales-ax-x" x="' + X(i).toFixed(1) + '" y="' + (H - 8) + '">' + esc(fmtMonth(r.month, { month: 'short', timeZone: 'UTC' })) + '</text>';
    }).join('');
    // Peak / low markers — highlight the best and worst month so the eye lands
    // on the story, not just the shape. Only when there's a real spread to show.
    var anno = '';
    if (n >= 3) {
      var iMax = 0, iMin = 0;
      for (var k = 1; k < n; k++) { if (vals[k] > vals[iMax]) iMax = k; if (vals[k] < vals[iMin]) iMin = k; }
      if (iMax !== iMin) {
        var fmtV = function (v) { return isRev ? fmtSARc(v) : fmtNum(v); };
        var anchor = function (i) { return i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'; };
        anno =
          '<circle class="sales-mark sales-mark--peak" cx="' + X(iMax).toFixed(1) + '" cy="' + Y(vals[iMax]).toFixed(1) + '" r="5.5" fill="none" stroke="' + color + '"/>' +
          '<text class="sales-mark-lb" text-anchor="' + anchor(iMax) + '" x="' + X(iMax).toFixed(1) + '" y="' + Math.max(padT + 10, Y(vals[iMax]) - 10).toFixed(1) + '">' +
            esc(t('salesPeak') + ' · ' + fmtV(vals[iMax])) + '</text>' +
          '<circle class="sales-mark sales-mark--low" cx="' + X(iMin).toFixed(1) + '" cy="' + Y(vals[iMin]).toFixed(1) + '" r="5.5" fill="none" stroke="var(--text-muted)"/>' +
          '<text class="sales-mark-lb sales-mark-lb--low" text-anchor="' + anchor(iMin) + '" x="' + X(iMin).toFixed(1) + '" y="' + (Y(vals[iMin]) + 18).toFixed(1) + '">' +
            esc(t('salesLow') + ' · ' + fmtV(vals[iMin])) + '</text>';
      }
    }
    var toggle = '<div class="sales-seg sales-metric" role="group" aria-label="' + esc(t('salesMetric')) + '">' +
      seg('metric', trendMetric, [{ v: 'revenue', l: t('salesKpiRevenue') }, { v: 'events', l: t('salesColEvents') }]) + '</div>';
    return '<div class="section sales-trend">' +
      '<div class="sales-sec-head"><h3>' + esc(t('salesTrend')) + '</h3>' + toggle + '</div>' +
      '<svg class="sales-svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" role="img"' +
        ' aria-label="' + esc((isRev ? t('salesKpiRevenue') : t('salesColEvents')) + ' — ' + t('salesTrendSub')) + '">' +
        grid + ylabels +
        '<path class="sales-area" d="' + areaPath + '" fill="' + color + '"/>' +
        '<polyline class="sales-line" points="' + linePts + '" fill="none" stroke="' + color + '"/>' +
        dots + xlabels + anno +
      '</svg>' +
    '</div>';
  }

  /* ---- Donut (share) ---------------------------------------------------------- */
  function donutSVG(segs) {
    var total = segs.reduce(function (a, s) { return a + s.value; }, 0) || 1;
    var r = 52, cx = 64, cy = 64, C = 2 * Math.PI * r, cum = 0;
    var arcs = segs.map(function (s) {
      var len = (s.value / total) * C;
      var pct = Math.round((s.value / total) * 100);
      var el = '<circle class="sales-donut-seg" cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + s.color + '"' +
        ' stroke-width="18" stroke-dasharray="' + len.toFixed(2) + ' ' + (C - len).toFixed(2) + '" stroke-dashoffset="' + (-cum).toFixed(2) +
        '" transform="rotate(-90 ' + cx + ' ' + cy + ')"><title>' + esc(s.label + ' ' + pct + '%') + '</title></circle>';
      cum += len; return el;
    }).join('');
    return '<svg class="sales-donut" viewBox="0 0 128 128" role="img" aria-label="' +
        esc(segs.map(function (s) { return s.label + ' ' + Math.round((s.value / total) * 100) + '%'; }).join(', ')) + '">' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="var(--border)" stroke-width="18"/>' + arcs +
    '</svg>';
  }
  function donutPanel(title, sub, segs) {
    var total = segs.reduce(function (a, s) { return a + s.value; }, 0) || 1;
    var legend = segs.map(function (s) {
      var pct = Math.round((s.value / total) * 100);
      return '<div class="sales-lgrow"><span class="sales-dot" style="background:' + s.color + '"></span>' +
        '<span class="sales-lgrow-l">' + esc(s.label) + '</span>' +
        '<span class="sales-lgrow-v">' + pct + '% · ' + fmtSARc(s.value) + '</span></div>';
    }).join('');
    return '<div class="section sales-donutcard">' +
      '<div class="sales-sec-head"><h3>' + esc(title) + '</h3><span class="sub">' + esc(sub) + '</span></div>' +
      '<div class="sales-donutwrap">' + donutSVG(segs) + '<div class="sales-lg-list">' + legend + '</div></div>' +
    '</div>';
  }

  /* ---- Top clients — horizontal bar ranking (CSS, RTL-aware) ------------------ */
  function topClientsHTML(rows) {
    var t = WP.i18n.t;
    var max = rows.reduce(function (a, o) { return Math.max(a, o.revenue); }, 0) || 1;
    var bars = rows.map(function (o) {
      var pct = Math.max(1, Math.round((o.revenue / max) * 100));
      var color = o.category === 'sports' ? 'var(--wbk-blue)' : 'var(--brand)';
      return '<div class="sales-tc-row">' +
        '<span class="sales-tc-name" title="' + esc(orgLabel(o)) + '">' + esc(orgLabel(o)) + '</span>' +
        '<span class="sales-tc-track"><span class="sales-tc-fill" style="width:' + pct + '%;background:' + color + '"></span></span>' +
        '<span class="sales-tc-val">' + fmtSARc(o.revenue) + '</span>' +
      '</div>';
    }).join('') || '<div class="sub">' + esc(t('salesNoClients')) + '</div>';
    var activeSub = t('salesTopClientsSub') + ' · ' + t('salesActiveInline').replace('{n}', fmtNum(rows.length));
    return '<div class="section sales-topclients">' +
      '<div class="sales-sec-head"><h3>' + esc(t('salesTopClients')) + '</h3><span class="sub">' + esc(activeSub) + '</span></div>' +
      '<div class="sales-tc">' + bars + '</div>' +
    '</div>';
  }

  /* ---- Detailed per-client table (filter-aware) ------------------------------- */
  function orgTableMount(host, months) {
    var t = WP.i18n.t;
    var rows = WP.sales.byOrg(months, opts());
    ui.table.mount(host, {
      id: 'sales-org',
      columns: [
        { key: 'name', label: t('salesColOrg'), sortable: true, get: function (r) { return orgLabel(r); } },
        { key: 'category', label: t('salesColCategory'), sortable: true },
        { key: 'events', label: t('salesColEvents'), num: true, sortable: true },
        { key: 'cashless', label: t('salesColCashless'), num: true, sortable: true },
        { key: 'onGround', label: t('salesColOnGround'), num: true, sortable: true },
        { key: 'revenue', label: t('salesColTotal'), num: true, sortable: true },
      ],
      rows: rows,
      rowId: function (r) { return r.orgId; },
      defaultSort: { key: 'revenue', dir: 'desc' },
      searchText: function (r) { return r.name + ' ' + r.nameAr; },
      searchPlaceholder: t('salesSearchOrg'),
      pageSizes: [8, 16, 32],
      emptyText: t('salesNoClients'),
      cell: function (r, key) {
        if (key === 'name') return '<span class="sales-org-nm">' + esc(orgLabel(r)) + '</span>';
        if (key === 'category') {
          var tone = r.category === 'sports' ? 'info' : 'brand';
          return '<span class="sales-cat-badge sales-cat-badge--' + tone + '">' +
            esc(r.category === 'sports' ? t('salesSports') : t('salesEntertainment')) + '</span>';
        }
        if (key === 'events') return fmtNum(r.events);
        if (key === 'cashless') return fmtSAR(r.cashless);
        if (key === 'onGround') return fmtSAR(r.onGround);
        if (key === 'revenue') return '<strong>' + fmtSAR(r.revenue) + '</strong>';
        return '';
      },
    });
  }

  /* ---- Anti-fraud (platform-wide, range-scoped) ------------------------------- */
  function fraudKpisHTML(f) {
    var t = WP.i18n.t;
    return '<div class="metrics sales-kpis">' +
      kpi(t('salesFraudScreened'), fmtNum(f.screened), t('salesFraudScreenedSub')) +
      kpi(t('salesFraudBlocked'), fmtNum(f.blocked),
        t('salesFraudFlaggedSub').replace('{n}', fmtNum(f.flagged)), 'var(--state-negative)') +
      kpi(t('salesFraudAtRisk'), fmtSARc(f.atRisk), t('salesFraudAtRiskSub'), 'var(--state-negative)') +
      kpi(t('salesFraudRecovered'), f.recoveryRate + '%',
        t('salesFraudRecoveredSub').replace('{v}', fmtSARc(f.recovered)), 'var(--state-positive)') +
    '</div>';
  }
  function fraudTableHTML(rows, tot) {
    var t = WP.i18n.t;
    var head = '<tr><th>' + esc(t('salesFraudColMonth')) + '</th>' +
      '<th class="wbk-th-num">' + esc(t('salesFraudColScreened')) + '</th>' +
      '<th class="wbk-th-num">' + esc(t('salesFraudColFlagged')) + '</th>' +
      '<th class="wbk-th-num">' + esc(t('salesFraudColBlocked')) + '</th>' +
      '<th class="wbk-th-num">' + esc(t('salesFraudColAtRisk')) + '</th>' +
      '<th class="wbk-th-num">' + esc(t('salesFraudColRecovered')) + '</th></tr>';
    var body = rows.map(function (f) {
      return '<tr><td>' + esc(fmtMonth(f.month)) + '</td>' +
        '<td class="wbk-td-num">' + fmtNum(f.screened) + '</td>' +
        '<td class="wbk-td-num">' + fmtNum(f.flagged) + '</td>' +
        '<td class="wbk-td-num">' + fmtNum(f.blocked) + '</td>' +
        '<td class="wbk-td-num">' + fmtSAR(f.atRisk) + '</td>' +
        '<td class="wbk-td-num">' + fmtSAR(f.recovered) + '</td></tr>';
    }).join('');
    var foot = '<tr class="sales-tr-total"><td>' + esc(t('salesFraudTotal')) + '</td>' +
      '<td class="wbk-td-num">' + fmtNum(tot.screened) + '</td>' +
      '<td class="wbk-td-num">' + fmtNum(tot.flagged) + '</td>' +
      '<td class="wbk-td-num">' + fmtNum(tot.blocked) + '</td>' +
      '<td class="wbk-td-num">' + fmtSAR(tot.atRisk) + '</td>' +
      '<td class="wbk-td-num">' + fmtSAR(tot.recovered) + '</td></tr>';
    return '<div class="wbk-table-wrap"><table class="wbk-table wbk-table--zebra">' +
      '<thead>' + head + '</thead><tbody>' + body + foot + '</tbody></table></div>';
  }
  function fraudHTML(months) {
    var t = WP.i18n.t;
    var f = WP.sales.fraud(months);
    return '<div class="section sales-fraud">' +
      '<div class="sales-sec-head"><h3>' + ui.icon('lock', 16) + ' ' + esc(t('salesFraud')) + '</h3>' +
        '<span class="sub">' + esc(t('salesFraudSub')) + '</span></div>' +
      fraudKpisHTML(f.totals) +
      '<div class="sales-fraud-rates">' +
        '<span class="sales-pill"><span class="sales-pill-k">' + esc(t('salesFraudBlockRate')) + '</span> ' + f.totals.blockRate + '%</span>' +
        '<span class="sales-pill"><span class="sales-pill-k">' + esc(t('salesFraudRate')) + '</span> ' + f.totals.fraudRateBps + ' ' + esc(t('salesFraudRateUnit')) + '</span>' +
        '<span class="sales-pill"><span class="sales-pill-k">' + esc(t('salesFraudChargebacks')) + '</span> ' + fmtNum(f.totals.chargebacks) + '</span>' +
      '</div>' +
      fraudTableHTML(f.rows, f.totals) +
      '<p class="sales-note">' + esc(t('salesFraudNote')) + '</p>' +
    '</div>';
  }

  /* ---- render ----------------------------------------------------------------- */
  function render(root) {
    var t = WP.i18n.t;
    var viewer = WP.viewer && WP.viewer();
    if (!WP.sales.canView(viewer)) {
      root.innerHTML = '<div class="view-pad">' +
        ui.pageHeader({ crumbs: [{ label: t('navDashboard'), route: 'dashboard' }, { label: t('salesTitle') }], title: t('salesTitle') }) +
        '<div class="section ex-clear">' + ui.icon('lock', 18) + ' <span>' + esc(t('salesDenied')) + '</span></div>' +
      '</div>';
      return;
    }

    var months = selectedMonths();
    var o = opts();
    var tot = WP.sales.totals(months, o);
    var prevW = WP.sales.prevWindow(months);
    var prev = prevW.length ? WP.sales.totals(prevW, o) : null;
    var trend = WP.sales.monthly(months, o);
    var orgRows = WP.sales.byOrg(months, o);
    // Category donut ignores the category filter (else it's 100% one slice) but
    // respects the client filter; hide it entirely when a category is pinned.
    var cat = WP.sales.byCategory(months, { orgId: filter.orgId });
    var showCat = filter.category === 'all';

    var donuts =
      (showCat ? donutPanel(t('salesCategorySplit'), t('salesCategorySub'), [
        { label: t('salesSports'), value: cat.sports.revenue, color: 'var(--wbk-blue)' },
        { label: t('salesEntertainment'), value: cat.entertainment.revenue, color: 'var(--brand)' },
      ]) : '') +
      donutPanel(t('salesRevenueMix'), t('salesRevenueMixSub'), [
        { label: t('salesCashless'), value: tot.cashless, color: 'var(--wbk-sea)' },
        { label: t('salesOnGround'), value: tot.onGround, color: 'var(--wbk-violet)' },
      ]);

    var hasData = tot.events > 0;
    var body = hasData
      ? (kpisHTML(tot, prev, months.length) +
        insightsHTML(tot, prev, orgRows) +
        '<div class="grid-2 sales-grid" style="align-items:start">' +
          trendHTML(trend) +
          '<div class="sales-donuts">' + donuts + '</div>' +
        '</div>' +
        topClientsHTML(orgRows) +
        '<div class="section sales-orgs">' +
          '<div class="sales-sec-head"><h3>' + esc(t('salesByOrg')) + '</h3>' +
            '<span class="sub">' + esc(t('salesByOrgSub')) + '</span></div>' +
          '<div id="sales-org-table"></div>' +
        '</div>' +
        fraudHTML(months))
      : ('<div class="section sales-empty">' + ui.icon('search', 22) +
          '<h3>' + esc(t('salesEmptyTitle')) + '</h3>' +
          '<p>' + esc(t('salesEmptyHint')) + '</p>' +
          '<button type="button" class="sales-reset" data-reset="1">' + ui.icon('x', 14) + ' ' + esc(t('salesReset')) + '</button>' +
        '</div>');

    root.innerHTML = '<div class="view-pad sales-view">' +
      ui.provenanceNote() +
      ui.pageHeader({
        crumbs: [{ label: t('navDashboard'), route: 'dashboard' }, { label: t('salesTitle') }],
        title: t('salesTitle'),
        subtitle: t('salesSubtitle'),
      }) +
      filterBarHTML() +
      body +
    '</div>';

    if (hasData) orgTableMount(root.querySelector('#sales-org-table'), months);

    // ---- wiring: every control repaints the whole dashboard from new state ----
    root.querySelectorAll('[data-range]').forEach(function (b) {
      b.onclick = function () {
        var v = b.dataset.range;
        if (v === 'custom') {
          if (filter.range === 'custom') return;
          filter.range = 'custom';
          // Seed from/to only when unset (preserve a prior custom selection).
          if (!filter.from || !filter.to) { var d = defaultCustomBounds(); filter.from = d.from; filter.to = d.to; }
          render(root); return;
        }
        var n = parseInt(v, 10);
        if (n && n !== filter.range) { filter.range = n; render(root); }
      };
    });
    // Custom From/To pickers. An inverted pick (To before From) is normalized by
    // SWAPPING the two ends — so the pickers always stay consistent with the
    // window shown, and no selection is silently discarded. (selectedMonths also
    // swaps defensively, so the data is correct even mid-normalization.)
    function normalizeCustom() {
      var m = WP.sales.months();
      if (filter.from && filter.to && m.indexOf(filter.from) > m.indexOf(filter.to)) {
        var tmp = filter.from; filter.from = filter.to; filter.to = tmp;
      }
    }
    var from = root.querySelector('[data-from]');
    var to = root.querySelector('[data-to]');
    if (from) from.onchange = function () { filter.from = from.value; normalizeCustom(); render(root); };
    if (to) to.onchange = function () { filter.to = to.value; normalizeCustom(); render(root); };
    root.querySelectorAll('[data-cat]').forEach(function (b) {
      b.onclick = function () {
        if (b.dataset.cat === filter.category) return;
        filter.category = b.dataset.cat;
        // If a pinned client no longer belongs to the chosen category, release it
        // so the two filters can never contradict each other.
        if (filter.orgId !== 'all' && filter.category !== 'all' && WP.sales.categoryOf(filter.orgId) !== filter.category) {
          filter.orgId = 'all';
        }
        render(root);
      };
    });
    root.querySelectorAll('[data-metric]').forEach(function (b) {
      b.onclick = function () { if (b.dataset.metric !== trendMetric) { trendMetric = b.dataset.metric; render(root); } };
    });
    var sel = root.querySelector('[data-client]');
    if (sel) sel.onchange = function () { filter.orgId = sel.value; render(root); };
    var reset = root.querySelector('[data-reset]');
    if (reset) reset.onclick = function () { filter = { range: 6, category: 'all', orgId: 'all', from: null, to: null }; render(root); };
  }

  WP.ui = WP.ui || {};
  WP.ui.sales = { render: render, _fmtSAR: fmtSAR, _fmtMonth: fmtMonth };
})(window.WP = window.WP || {});
