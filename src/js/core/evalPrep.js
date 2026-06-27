/* ============================================================
 * Tempo — AI Evaluation Preparation (Intelligence Layer P2, core)
 * SPEC: docs/SPEC-eval-prep.md · GATE: ai-os/00-governance/INTELLIGENCE-ETHICS.md
 * ------------------------------------------------------------
 * PREP ONLY. This assembles the evidence a manager ALREADY has (the Wave 3.001
 * append-only event store) into a grouped, sourced, gap-honest summary so they
 * walk into an evaluation prepared instead of relying on memory.
 *
 * Hard guardrails (enforced here, not just by convention):
 *  - NO score, NO rating, NO verdict, NO recommendation. Scoring/bias is P3.
 *    summarize() returns NOTHING that ranks or judges — only sourced lines + gaps.
 *  - NO fabrication: a line with no `source` is DROPPED, never invented (Ethics #2).
 *  - Gaps are LISTED, not filled: an empty category becomes a stated gap.
 *  - "Not enough evidence" is a first-class result when the store is sparse.
 *  - Access gating + framing ("you decide") live in the UI layer.
 * ========================================================== */
(function (WP) {
  'use strict';

  var CONFIG = {
    minEvidence: 3, // fewer than this many SOURCED events → "not enough evidence yet"
    // categories we expect to find evidence across (mirrors the event store)
    categories: ['workload', 'wellbeing', 'evaluation', 'recognition', 'decision']
  };

  function categories() {
    return (WP.events && WP.events.CATEGORIES) ? WP.events.CATEGORIES.slice() : CONFIG.categories.slice();
  }

  /* Map one event → one prep line. Returns null when the event has no source, so
   * the caller can drop it (anti-fabrication guard at the boundary). */
  function lineOf(e) {
    if (!e || !e.source) return null; // never show a line we can't attribute
    return {
      text: e.description || '',
      source: e.source,
      ts: e.ts || null,
      confidence: e.confidence || 'observed',
      category: e.category || 'decision',
      growth: !!e.growth
    };
  }

  /* PURE + DETERMINISTIC. Turn an events array into a prep summary.
   * Returns ONLY descriptive structure — no score/rating/verdict, ever. */
  function summarize(events, opts) {
    opts = opts || {};
    var cats = categories();
    var sourced = (events || []).map(lineOf).filter(Boolean); // drops sourceless = no fabrication

    var byCategory = {};
    cats.forEach(function (c) { byCategory[c] = []; });
    sourced.forEach(function (ln) {
      if (!byCategory[ln.category]) byCategory[ln.category] = []; // tolerate unknown category
      byCategory[ln.category].push(ln);
    });

    // sections in a stable, meaningful order; only categories that HAVE evidence
    var sections = cats
      .filter(function (c) { return byCategory[c] && byCategory[c].length; })
      .map(function (c) { return { category: c, lines: byCategory[c] }; });

    // gaps: expected categories with zero sourced evidence — listed, never filled
    var gaps = cats
      .filter(function (c) { return !byCategory[c] || !byCategory[c].length; })
      .map(function (c) { return { category: c, reason: 'noEvidence' }; });

    // growth highlights (sourced), newest-first preserved from input order
    var highlights = sourced.filter(function (ln) { return ln.growth; });

    return {
      enough: sourced.length >= CONFIG.minEvidence,
      total: (events || []).length,
      sourcedCount: sourced.length,
      byCategory: byCategory,
      sections: sections,
      gaps: gaps,
      highlights: highlights
      // NOTE: intentionally no `score`, `rating`, `verdict`, or `recommendation`.
    };
  }

  /* Async wrapper: pull this person's events from the store (derived ∪ appended),
   * then summarize. Core stays data-only; the UI handles access + presentation. */
  function prepare(subjectId, opts, refDate) {
    var q = (WP.events && WP.events.query)
      ? WP.events.query(subjectId, opts || {}, refDate)
      : Promise.resolve([]);
    return Promise.resolve(q).then(function (events) {
      var s = summarize(events, opts);
      s.subjectId = subjectId;
      return s;
    });
  }

  WP.evalPrep = {
    CONFIG: CONFIG,
    summarize: summarize,
    prepare: prepare,
    _lineOf: lineOf // exposed for tests
  };
})(window.WP = window.WP || {});
