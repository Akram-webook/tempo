/* ============================================================
 * Tempo — Events Sales engine (pure aggregations)
 * ------------------------------------------------------------
 * CORE LAYER — DOM-free by rule (test/verify-architecture.js). Reads the sample
 * dataset from WP.salesData and rolls it up the ways the director asked for:
 *
 *   1. Total events sold, per month (count of events).
 *   2. Sales per organization (client), per month, sports vs entertainment.
 *   3. Revenue split: cashless vs on-ground.
 *   4. Anti-fraud reporting (screened / flagged / blocked / at-risk / recovered).
 *
 * Every rollup takes an optional `months` array (a range, e.g. the last 6) AND
 * an optional `opts = { category, orgId }` filter, so the dashboard's filter bar
 * (range + sports/entertainment + client) drives one composable query. Returns
 * plain numbers/objects — the UI layer owns all currency/locale formatting and
 * all chart drawing. Reusable by the real build because it never touches the DOM.
 * ========================================================== */
(function (WP) {
  'use strict';

  function data() { return WP.salesData || { MONTHS: [], ORGS: [], RECORDS: [], FRAUD: [] }; }

  function months() { return data().MONTHS.slice(); }
  function orgs() { return data().ORGS.slice(); }
  function orgById(id) { return data().ORGS.filter(function (o) { return o.id === id; })[0] || null; }
  function categoryOf(orgId) { var o = orgById(orgId); return o ? o.category : 'entertainment'; }

  // Month-range lookup. No range / empty ⇒ every month.
  function inRange(range) {
    if (!range || !range.length) return function () { return true; };
    var set = {};
    range.forEach(function (m) { set[m] = 1; });
    return function (m) { return !!set[m]; };
  }
  // Category + client filter. Absent / 'all' ⇒ pass everything.
  function matchOpts(r, opts) {
    if (!opts) return true;
    if (opts.category && opts.category !== 'all' && categoryOf(r.orgId) !== opts.category) return false;
    if (opts.orgId && opts.orgId !== 'all' && r.orgId !== opts.orgId) return false;
    return true;
  }
  function records(range, opts) {
    var ok = inRange(range);
    return data().RECORDS.filter(function (r) { return ok(r.month) && matchOpts(r, opts); });
  }

  // The equal-length window immediately BEFORE the given range (for prior-period
  // deltas). Shorter/empty near the start of history — the UI treats null as "no
  // comparison". `range` is expected to be a contiguous tail of MONTHS.
  function prevWindow(range) {
    var all = data().MONTHS;
    if (!range || !range.length) return [];
    var firstIdx = all.indexOf(range[0]);
    if (firstIdx <= 0) return [];
    var start = Math.max(0, firstIdx - range.length);
    return all.slice(start, firstIdx);
  }

  // ---- 1 + 3. Per-month rollup: events + cashless/on-ground + category split ---
  function monthly(range, opts) {
    var ok = inRange(range);
    return data().MONTHS.filter(ok).map(function (m) {
      var rows = data().RECORDS.filter(function (r) { return r.month === m && matchOpts(r, opts); });
      var o = { month: m, events: 0, cashless: 0, onGround: 0, revenue: 0,
        sportsRevenue: 0, entertainmentRevenue: 0, sportsEvents: 0, entertainmentEvents: 0 };
      rows.forEach(function (r) {
        var rev = r.cashless + r.onGround;
        o.events += r.events; o.cashless += r.cashless; o.onGround += r.onGround; o.revenue += rev;
        if (categoryOf(r.orgId) === 'sports') { o.sportsRevenue += rev; o.sportsEvents += r.events; }
        else { o.entertainmentRevenue += rev; o.entertainmentEvents += r.events; }
      });
      return o;
    });
  }

  // ---- Headline totals across the range (drives the KPI cards) ----------------
  function totals(range, opts) {
    var rows = records(range, opts);
    var t = { events: 0, cashless: 0, onGround: 0, revenue: 0,
      sportsRevenue: 0, entertainmentRevenue: 0, sportsEvents: 0, entertainmentEvents: 0, orgs: 0 };
    var seenOrg = {};
    rows.forEach(function (r) {
      var rev = r.cashless + r.onGround;
      t.events += r.events; t.cashless += r.cashless; t.onGround += r.onGround; t.revenue += rev;
      seenOrg[r.orgId] = 1;
      if (categoryOf(r.orgId) === 'sports') { t.sportsRevenue += rev; t.sportsEvents += r.events; }
      else { t.entertainmentRevenue += rev; t.entertainmentEvents += r.events; }
    });
    t.orgs = Object.keys(seenOrg).length;
    t.cashlessPct = t.revenue ? Math.round((t.cashless / t.revenue) * 100) : 0;
    t.onGroundPct = t.revenue ? 100 - t.cashlessPct : 0;
    t.avgPerEvent = t.events ? Math.round(t.revenue / t.events) : 0;
    return t;
  }

  // ---- 2. Sales per organization (client), scoped to range + filter ----------
  function byOrg(range, opts) {
    var rows = records(range, opts);
    var by = {};
    rows.forEach(function (r) {
      var o = by[r.orgId] || (by[r.orgId] = { orgId: r.orgId, events: 0, cashless: 0, onGround: 0, revenue: 0 });
      o.events += r.events; o.cashless += r.cashless; o.onGround += r.onGround; o.revenue += r.cashless + r.onGround;
    });
    return Object.keys(by).map(function (id) {
      var o = by[id], org = orgById(id);
      o.name = org ? org.name : id;
      o.nameAr = org ? org.nameAr : id;
      o.category = org ? org.category : 'entertainment';
      return o;
    }).sort(function (a, b) { return b.revenue - a.revenue; });
  }

  // ---- 2. Sports vs entertainment split ---------------------------------------
  function byCategory(range, opts) {
    var rows = records(range, opts);
    var out = { sports: { events: 0, cashless: 0, onGround: 0, revenue: 0, orgs: 0 },
      entertainment: { events: 0, cashless: 0, onGround: 0, revenue: 0, orgs: 0 } };
    var seen = { sports: {}, entertainment: {} };
    rows.forEach(function (r) {
      var c = categoryOf(r.orgId), b = out[c];
      b.events += r.events; b.cashless += r.cashless; b.onGround += r.onGround; b.revenue += r.cashless + r.onGround;
      seen[c][r.orgId] = 1;
    });
    out.sports.orgs = Object.keys(seen.sports).length;
    out.entertainment.orgs = Object.keys(seen.entertainment).length;
    out.total = out.sports.revenue + out.entertainment.revenue;
    return out;
  }

  // ---- 4. Anti-fraud reporting (platform-wide, range-scoped) ------------------
  // Payment screening is not attributable to a single client in the sample feed,
  // so fraud responds to the month RANGE only (not the category/client filter).
  function fraud(range) {
    var ok = inRange(range);
    var rows = data().FRAUD.filter(function (f) { return ok(f.month); });
    var sum = { screened: 0, flagged: 0, blocked: 0, atRisk: 0, recovered: 0, chargebacks: 0 };
    rows.forEach(function (f) {
      sum.screened += f.screened; sum.flagged += f.flagged; sum.blocked += f.blocked;
      sum.atRisk += f.atRisk; sum.recovered += f.recovered; sum.chargebacks += f.chargebacks;
    });
    sum.blockRate = sum.flagged ? Math.round((sum.blocked / sum.flagged) * 100) : 0;
    sum.recoveryRate = sum.atRisk ? Math.round((sum.recovered / sum.atRisk) * 100) : 0;
    sum.fraudRateBps = sum.screened ? Math.round((sum.blocked / sum.screened) * 10000) : 0;
    return { rows: rows, totals: sum };
  }

  // ---- Access: director / admin / super-admin only (defence-in-depth gate) -----
  function canView(viewer) { return !!(WP.access && WP.access.canManage(viewer)); }

  WP.sales = {
    months: months, orgs: orgs, orgById: orgById, categoryOf: categoryOf,
    records: records, monthly: monthly, totals: totals, byOrg: byOrg,
    byCategory: byCategory, fraud: fraud, prevWindow: prevWindow, canView: canView,
  };
})(window.WP = window.WP || {});
