/* ============================================================
 * Tempo — Events Sales mock data (director reporting)
 * ------------------------------------------------------------
 * DATA LAYER. The Sales section (src/js/core/sales.js engine +
 * src/js/ui/sales.js view) reads ONLY from here. All figures are
 * SAMPLE data — the shape mirrors what the real Data House / ticketing
 * feed will return, so swapping this module for a live loader later is
 * the single seam (same as mock-data.js for the org directory).
 *
 * SHAPE (frozen contract the engine + tests rely on):
 *   MONTHS  : ['YYYY-MM', ...] ascending, 12 trailing months.
 *   ORGS    : [{ id, name, nameAr, category:'sports'|'entertainment' }]
 *   RECORDS : [{ orgId, month, events, cashless, onGround }]  — one per org per month.
 *               cashless / onGround are revenue in SAR (integer halalas rounded to riyals).
 *   FRAUD   : [{ month, screened, flagged, blocked, atRisk, recovered, chargebacks }]
 *               screened = cashless transactions checked; atRisk/recovered in SAR.
 *
 * DETERMINISTIC: every number is a pure function of (org, month) via fixed
 * base rates + a seasonality curve + a sin() wobble — NO Math.random — so the
 * dashboard and test/verify-sales.js always agree.
 * ========================================================== */
(function (WP) {
  'use strict';

  // 12 trailing months ending Aug 2026 (matches the demo "today"). Hard-coded so
  // the dataset is stable for tests (never derived from the wall clock).
  var MONTHS = [
    '2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02',
    '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08',
  ];

  // Client organizations (sample). Category drives the sports vs entertainment split.
  var ORGS = [
    { id: 'o_riyadh_season', name: 'Riyadh Season',       nameAr: 'موسم الرياض',        category: 'entertainment' },
    { id: 'o_mdlbeast',      name: 'MDLBEAST',            nameAr: 'إم دي إل بيست',       category: 'entertainment' },
    { id: 'o_boulevard',     name: 'Boulevard World',     nameAr: 'بوليفارد وورلد',      category: 'entertainment' },
    { id: 'o_gea',           name: 'General Entertainment', nameAr: 'هيئة الترفيه',       category: 'entertainment' },
    { id: 'o_spl',           name: 'Saudi Pro League',    nameAr: 'دوري روشن السعودي',   category: 'sports' },
    { id: 'o_diriyah',       name: 'Diriyah E-Prix',      nameAr: 'سباق الدرعية',        category: 'sports' },
    { id: 'o_kingdom_arena', name: 'Kingdom Arena',       nameAr: 'أرينا المملكة',       category: 'sports' },
    { id: 'o_season_sports', name: 'Riyadh Season Sports', nameAr: 'رياضة موسم الرياض',  category: 'sports' },
  ];

  // Per-org base rates: typical events/month + average cashless & on-ground
  // revenue PER EVENT (SAR). Entertainment leans cashless (online ticketing);
  // sports carries a bigger on-ground gate + concessions share.
  var BASE = {
    o_riyadh_season: { events: 40, cashless: 320000, onGround: 110000 },
    o_mdlbeast:      { events: 12, cashless: 900000, onGround: 250000 },
    o_boulevard:     { events: 55, cashless: 90000,  onGround: 60000  },
    o_gea:           { events: 20, cashless: 200000, onGround: 70000  },
    o_spl:           { events: 30, cashless: 400000, onGround: 120000 },
    o_diriyah:       { events: 4,  cashless: 1200000, onGround: 300000 },
    o_kingdom_arena: { events: 18, cashless: 260000, onGround: 90000  },
    o_season_sports: { events: 10, cashless: 150000, onGround: 55000  },
  };

  // Seasonality multipliers per month index (0 = 2025-09 … 11 = 2026-08).
  // Entertainment peaks in the Riyadh Season winter window; sports peaks around
  // season start and the spring finals. Both average ~1.0 across the year.
  var SEASON_ENT = [0.7, 1.1, 1.4, 1.5, 1.3, 1.0, 0.9, 0.8, 0.7, 0.6, 0.7, 0.9];
  var SEASON_SPT = [1.2, 1.1, 1.0, 0.9, 0.95, 1.0, 1.15, 1.25, 1.2, 0.9, 0.85, 1.1];

  // Deterministic ±8% wobble so the curves aren't mechanically smooth. Pure
  // function of the two indices — reproducible, never Math.random.
  function wobble(orgIdx, monthIdx) {
    return 1 + 0.08 * Math.sin(orgIdx * 1.7 + monthIdx * 0.9);
  }

  var RECORDS = [];
  ORGS.forEach(function (org, oi) {
    var base = BASE[org.id];
    var season = org.category === 'sports' ? SEASON_SPT : SEASON_ENT;
    MONTHS.forEach(function (month, mi) {
      var w = wobble(oi, mi);
      var events = Math.max(1, Math.round(base.events * season[mi]));
      var cashless = Math.round(events * base.cashless * w);
      var onGround = Math.round(events * base.onGround * w);
      RECORDS.push({ orgId: org.id, month: month, events: events, cashless: cashless, onGround: onGround });
    });
  });

  // ---- Anti-fraud (per month) -------------------------------------------------
  // Derived from that month's total cashless volume: a small, realistic share of
  // transactions is flagged by screening; most flags are confirmed and blocked;
  // the SAR at risk is largely recovered. Rates wobble deterministically month to
  // month. This is the shape a payments/anti-fraud feed would return.
  var AVG_CASHLESS_TXN = 175;   // SAR — average cashless ticket, to size "screened".
  var AVG_FRAUD_TXN    = 480;   // SAR — average value of a blocked fraudulent txn.
  var FRAUD = MONTHS.map(function (month, mi) {
    var totalCashless = RECORDS
      .filter(function (r) { return r.month === month; })
      .reduce(function (a, r) { return a + r.cashless; }, 0);
    var screened = Math.round(totalCashless / AVG_CASHLESS_TXN);
    var flagRate = 0.0075 + 0.0015 * Math.sin(mi * 1.3);   // ~0.6%–0.9% of txns flagged
    var flagged = Math.round(screened * flagRate);
    var blocked = Math.round(flagged * (0.70 + 0.04 * Math.sin(mi * 0.7)));   // ~70–74% confirmed
    var atRisk = blocked * AVG_FRAUD_TXN;
    var recovered = Math.round(atRisk * (0.82 + 0.03 * Math.sin(mi * 1.1)));  // ~82–85% recovered
    var chargebacks = Math.round(flagged * 0.15);
    return { month: month, screened: screened, flagged: flagged, blocked: blocked,
      atRisk: atRisk, recovered: recovered, chargebacks: chargebacks };
  });

  WP.salesData = {
    currency: 'SAR',
    MONTHS: MONTHS,
    ORGS: ORGS,
    RECORDS: RECORDS,
    FRAUD: FRAUD,
  };
})(window.WP = window.WP || {});
