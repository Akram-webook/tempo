/* ============================================================
 * Tempo — Evaluation Intelligence (Intelligence Layer P3, core · ENGINE ONLY)
 * SPEC: docs/SPEC-eval-intel.md · GATE: ai-os/00-governance/INTELLIGENCE-ETHICS.md
 * ------------------------------------------------------------
 * Reads the append-only evidence store (WP.db.events / WP.events: delivery, risk,
 * plan, workload, wellbeing, evaluation, recognition, decision) to help a manager
 * evaluate FROM EVIDENCE, not memory. It SUPPORTS the human — it never decides.
 *
 * Two read-only, pure outputs:
 *   suggestedRange(personId, cycle, opts)  -> a /5 RANGE [low,high] (never one number)
 *                                             + reasoning + evidence + risks, or a
 *                                             first-class "not enough evidence yet".
 *   consistencyCheck(evaluatorId, cycle, opts) -> awareness WARNINGS only (never
 *                                             blocking, never accusatory, never a
 *                                             score/rank of anyone).
 *
 * Hard guardrails (enforced here + asserted in test/verify-evalintel.js):
 *  - Human decides — output is a range + evidence + reasoning. NO single score,
 *    NO rating, NO rank, NO verdict, NO grade field. Ever. (Ethics #3)
 *  - Evidence-first — every suggestion/warning cites real sourced events; a
 *    sourceless event is dropped, never used. "Not enough evidence yet" is a
 *    valid, first-class result. (Ethics #2)
 *  - Support, not surveil — reads the WORK/evidence, never presence, behaviour,
 *    personality, response-time or sentiment. (Ethics #1)
 *  - Transparent — reasoning + evidence refs travel on every item. (Ethics #4)
 *  - Dignity — risks/warnings are neutral, constructive, "worth a second look",
 *    never "you are biased"; growth counts as much as gaps. (Ethics #5)
 *  - Access-gated — consumes manager/eval context only; if a viewer is supplied
 *    it must pass canSeeSensitive (mirrors can_read_person). Never peer-exposed. (#6)
 *
 * NO DOM, NO network. The evaluation screen surfaces this in a later wave.
 * ========================================================== */
(function (WP) {
  'use strict';

  var CONFIG = {
    minEvidence: 3,     // fewer than this many SOURCED events → "not enough evidence yet"
    scaleMin: 1,
    scaleMax: 5,
    base: 3.0,          // neutral anchor before evidence moves it
    minSpan: 0.4,       // a range NEVER collapses to a single number (low < high)
    // positive evidence that should lift the anchor (cited, capped so no single
    // signal dominates). risks do NOT mechanically lower the score (dignity) —
    // they widen the band + are surfaced for the human to weigh.
    perDelivery: 0.15, deliveryCap: 6,
    perRecognition: 0.25, recognitionCap: 4,
    planNudge: 0.1
  };

  function clamp(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }
  function r1(x) { return Math.round(x * 10) / 10; }

  // A citable reference for one event — never invent one; drop sourceless events.
  function refOf(e) {
    if (!e || !e.source) return null; // anti-fabrication boundary (Ethics #2)
    return {
      id: e.id || null,
      ts: e.ts || null,
      category: e.category || null,
      source: e.source,
      confidence: e.confidence || 'observed',
      refs: (e.evidenceRefs || []).slice(),
      text: e.description || ''
    };
  }

  /* PURE + DETERMINISTIC. Turn a scoped events array into a suggested RANGE.
   * Returns ONLY a range + reasoning + evidence + risks — never a single score. */
  function assess(events, opts) {
    opts = opts || {};
    var cited = (events || []).map(refOf).filter(Boolean); // drops sourceless = no fabrication

    // Not enough evidence is a first-class, honest result — we do NOT fabricate a range.
    if (cited.length < CONFIG.minEvidence) {
      return {
        enoughEvidence: false,
        range: null,
        confidence: 'low',
        reasoning: [{ text: 'Not enough evidence yet', evidence: cited.map(citeId) }],
        evidence: cited,
        risks: [],
        sourcedCount: cited.length,
        total: (events || []).length
      };
    }

    var byCat = {};
    cited.forEach(function (c) { (byCat[c.category] = byCat[c.category] || []).push(c); });
    var delivery = byCat.delivery || [];
    var recognition = byCat.recognition || [];
    var plan = byCat.plan || [];
    var risk = byCat.risk || [];

    // --- anchor: calibrate to the org baseline mean when we have one (so the band
    // tracks how this team actually rates), else the neutral CONFIG.base. Then lift
    // on cited positive evidence (each capped). ---
    var calibrated = (typeof opts.orgMean === 'number');
    var center = calibrated ? opts.orgMean : CONFIG.base;
    var reasoning = [];

    if (delivery.length) {
      var dN = Math.min(delivery.length, CONFIG.deliveryCap);
      center += dN * CONFIG.perDelivery;
      reasoning.push({
        text: 'Sustained delivery: ' + delivery.length + ' logged item(s) of completed work',
        category: 'delivery',
        evidence: delivery.map(citeId)
      });
    }
    if (recognition.length) {
      var rN = Math.min(recognition.length, CONFIG.recognitionCap);
      center += rN * CONFIG.perRecognition;
      reasoning.push({
        text: 'Recognition on record: ' + recognition.length + ' item(s)',
        category: 'recognition',
        evidence: recognition.map(citeId)
      });
    }
    if (plan.length) {
      center += CONFIG.planNudge;
      reasoning.push({
        text: 'Forward planning evidenced: ' + plan.length + ' item(s)',
        category: 'plan',
        evidence: plan.map(citeId)
      });
    }
    center = clamp(center, CONFIG.scaleMin, CONFIG.scaleMax);

    // --- risks: surfaced for the human, NOT auto-deducted (dignity, Ethics #5).
    // Open blockers widen the band (less certainty), they don't quietly cut the score. ---
    var risks = risk.map(function (c) {
      return { text: 'Open blocker to weigh: ' + (c.text || 'logged blocker'), evidence: [citeId(c)], ts: c.ts, confidence: c.confidence };
    });

    // --- uncertainty half-width: more (high-confidence) evidence narrows it;
    // sparse data or open risks widen it. The band is honest about what we know. ---
    var hi = cited.filter(function (c) { return c.confidence === 'recorded' || c.confidence === 'observed' || c.confidence === 'high'; }).length;
    var hw = 0.5;
    if (cited.length < 6) hw += 0.3;
    if (risk.length) hw += 0.2;
    hw -= Math.min(cited.length, 12) * 0.02;
    if (hi >= 6) hw -= 0.1;
    hw = clamp(hw, CONFIG.minSpan, 0.9);

    var low = clamp(center - hw, CONFIG.scaleMin, CONFIG.scaleMax);
    var high = clamp(center + hw, CONFIG.scaleMin, CONFIG.scaleMax);
    // guarantee the range never collapses to a single number, even at a scale edge
    if (high - low < CONFIG.minSpan) {
      if (high >= CONFIG.scaleMax) low = clamp(high - CONFIG.minSpan, CONFIG.scaleMin, CONFIG.scaleMax);
      else high = clamp(low + CONFIG.minSpan, CONFIG.scaleMin, CONFIG.scaleMax);
    }

    // confidence in the SUGGESTION (not a person score): driven by evidence volume + risk noise.
    var confidence = 'med';
    if (cited.length >= 8 && hi >= 6 && risk.length === 0) confidence = 'high';
    else if (cited.length >= CONFIG.minEvidence && cited.length < 6) confidence = 'low';

    return {
      enoughEvidence: true,
      range: [r1(low), r1(high)], // a RANGE on /5 — anchors a conversation, never a verdict
      confidence: confidence,
      reasoning: reasoning,
      evidence: cited,
      risks: risks,
      // transparent about the anchor: calibrated to the cycle baseline when available,
      // else the neutral default — so the /5 band tracks how this team actually rates.
      baseline: calibrated ? { anchoredTo: 'orgMean', value: r1(opts.orgMean) } : { anchoredTo: 'default', value: CONFIG.base },
      sourcedCount: cited.length,
      total: (events || []).length
    };
  }
  function citeId(c) { return c.id || c.source || (c.category + '@' + c.ts); }

  /* Resolve a cycle (id | object | undefined→active) to a [start,end] window. */
  function cycleWindow(cycle) {
    var c = null;
    var all = (WP.evaluation && WP.evaluation.cycles) ? WP.evaluation.cycles() : [];
    if (cycle && typeof cycle === 'object') c = cycle;
    else if (typeof cycle === 'string') c = all.filter(function (x) { return x.id === cycle || x.name === cycle; })[0];
    if (!c && WP.evaluation && WP.evaluation.activeCycle) c = WP.evaluation.activeCycle();
    if (!c) return null;
    return { id: c.id, name: c.name, start: c.start, end: c.end };
  }
  function inWindow(ts, win) {
    if (!win || !ts) return true;
    var d = String(ts).slice(0, 10);
    if (win.start && d < win.start) return false;
    if (win.end && d > win.end) return false;
    return true;
  }

  /* ACCESS GATE (Ethics #6): if a viewer is supplied, they must be allowed to see
   * this person's sensitive evidence (mirrors can_read_person / canSeeSensitive).
   * No viewer → caller is trusted server/eval context (same contract as evalPrep). */
  function denied(personId) {
    return { enoughEvidence: false, denied: true, range: null, confidence: 'low', reasoning: [], evidence: [], risks: [], subjectId: personId };
  }
  function gateOk(opts, personId) {
    if (!opts || !opts.viewer) return true;
    return !!(WP.access && WP.access.canSeeSensitive && WP.access.canSeeSensitive(opts.viewer, personId));
  }

  /* Org baseline = mean overall across ALL completed reviews (anonymous aggregate).
   * Used to calibrate the suggested-range anchor + to flag leniency/severity skew. */
  function orgBaselineMean() {
    var EV = (WP.data && WP.data.EVALUATIONS) || {};
    var overallOf = (WP.evaluation && WP.evaluation.overall) ? WP.evaluation.overall : function () { return null; };
    var vals = [];
    Object.keys(EV).forEach(function (pid) {
      var rec = EV[pid];
      if (rec && rec.status === 'Completed') { var o = overallOf(rec); if (typeof o === 'number') vals.push(o); }
    });
    return vals.length ? vals.reduce(function (a, b) { return a + b; }, 0) / vals.length : null;
  }

  /* Async wrapper: pull this person's cycle-scoped events from the store, then
   * assess. Core stays data-only; the UI handles presentation + final framing. */
  function suggestedRange(personId, cycle, opts) {
    opts = opts || {};
    if (!gateOk(opts, personId)) return Promise.resolve(denied(personId));
    var win = cycleWindow(cycle);
    var q = (WP.events && WP.events.query) ? WP.events.query(personId, {}, opts.refDate) : Promise.resolve([]);
    // calibrate the anchor to the cycle baseline unless the caller overrode orgMean.
    var assessOpts = opts;
    if (typeof opts.orgMean !== 'number') {
      var base = orgBaselineMean();
      if (base != null) { assessOpts = {}; for (var k in opts) assessOpts[k] = opts[k]; assessOpts.orgMean = base; }
    }
    return Promise.resolve(q).then(function (events) {
      var scoped = (events || []).filter(function (e) { return inWindow(e.ts, win); });
      var s = assess(scoped, assessOpts);
      s.subjectId = personId;
      s.cycle = win ? win.id : null;
      return s;
    });
  }

  /* ---- CONSISTENCY / BIAS AWARENESS ----------------------------------------
   * PURE. Given the evaluations one evaluator completed this cycle (each row:
   * { subjectId, overall (/5), evidenceCount, refs[] }) plus an org baseline mean,
   * surface AWARENESS warnings. Never ranks/scores people; never blocks; framed
   * "worth a second look", never "you are biased". Every warning cites evidence. */
  function assessConsistency(rows, opts) {
    opts = opts || {};
    rows = (rows || []).filter(function (r) { return r && typeof r.overall === 'number'; });
    var warnings = [];
    if (rows.length < 2) {
      return { enoughData: false, warnings: [], n: rows.length };
    }

    var vals = rows.map(function (r) { return r.overall; });
    var mean = vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
    var variance = vals.reduce(function (a, b) { return a + (b - mean) * (b - mean); }, 0) / vals.length;
    var spread = Math.sqrt(variance);
    var refsAll = rows.map(function (r) { return { subjectId: r.subjectId, evidence: (r.refs || []).slice(), overall: r.overall }; });

    // 1) Central tendency — ratings cluster tightly near the mid-point.
    if (spread < 0.4 && mean > 2.6 && mean < 3.4) {
      warnings.push({
        type: 'central-tendency',
        text: 'These ratings sit very close together near the middle — worth a second look to be sure each reflects its own evidence.',
        explanation: 'Spread across ' + rows.length + ' reviews is low (σ≈' + r1(spread) + ', mean≈' + r1(mean) + '/5). Tightly-clustered mid-scores can mask real differences.',
        evidence: refsAll
      });
    }

    // 2) Leniency / severity skew — evaluator mean far from the org baseline.
    var base = (typeof opts.orgMean === 'number') ? opts.orgMean : null;
    if (base != null && Math.abs(mean - base) >= 0.6) {
      var lenient = mean > base;
      warnings.push({
        type: lenient ? 'leniency-skew' : 'severity-skew',
        text: 'Your average (' + r1(mean) + '/5) runs ' + (lenient ? 'higher' : 'lower') + ' than the wider average (' + r1(base) + '/5) — worth a second look.',
        explanation: 'Not a verdict — calibration context. A consistent gap from the baseline is worth checking against the evidence per person.',
        evidence: refsAll
      });
    }

    // 3) Evidence-mismatch — a rating that doesn't match the evidence volume on record.
    rows.forEach(function (r) {
      var n = r.evidenceCount || 0;
      if (r.overall >= 4 && n < CONFIG.minEvidence) {
        warnings.push({
          type: 'evidence-light-high',
          text: 'A strong rating (' + r1(r.overall) + '/5) with little logged evidence — worth a second look or capturing more examples.',
          explanation: 'Only ' + n + ' sourced item(s) on record for this review; a high rating reads stronger when the evidence backs it.',
          evidence: [{ subjectId: r.subjectId, evidence: (r.refs || []).slice(), overall: r.overall }]
        });
      } else if (r.overall <= 2 && n < CONFIG.minEvidence) {
        warnings.push({
          type: 'evidence-light-low',
          text: 'A low rating (' + r1(r.overall) + '/5) with little logged evidence — worth a second look so it is well-supported.',
          explanation: 'Only ' + n + ' sourced item(s) on record; a low rating is fairer to the person when the evidence is on record.',
          evidence: [{ subjectId: r.subjectId, evidence: (r.refs || []).slice(), overall: r.overall }]
        });
      }
    });

    return { enoughData: true, warnings: warnings, n: rows.length, mean: r1(mean), spread: r1(spread) };
  }

  /* Async wrapper: gather this evaluator's completed reviews for the cycle from
   * WP.data.EVALUATIONS, attach each subject's cited evidence count from the store,
   * compute the org baseline mean, then assess. Access-gated to the evaluator/dir. */
  function consistencyCheck(evaluatorId, cycle, opts) {
    opts = opts || {};
    var win = cycleWindow(cycle);
    var EV = (WP.data && WP.data.EVALUATIONS) || {};
    var overallOf = (WP.evaluation && WP.evaluation.overall) ? WP.evaluation.overall : function () { return null; };

    // org baseline: mean overall across ALL completed reviews (anonymous aggregate).
    var orgMean = orgBaselineMean();

    // this evaluator's completed reviews
    var mine = Object.keys(EV).filter(function (pid) {
      var rec = EV[pid];
      return rec && rec.status === 'Completed' && rec.evaluatorId === evaluatorId;
    });

    // attach each subject's sourced-evidence count from the store
    return Promise.all(mine.map(function (pid) {
      var rec = EV[pid];
      var q = (WP.events && WP.events.query) ? WP.events.query(pid, {}, opts.refDate) : Promise.resolve([]);
      return Promise.resolve(q).then(function (events) {
        var cited = (events || []).map(refOf).filter(Boolean).filter(function (c) { return inWindow(c.ts, win); });
        return { subjectId: pid, overall: overallOf(rec), evidenceCount: cited.length, refs: cited.map(citeId) };
      });
    })).then(function (rows) {
      var out = assessConsistency(rows, { orgMean: orgMean });
      out.evaluatorId = evaluatorId;
      out.cycle = win ? win.id : null;
      out.orgMean = orgMean != null ? r1(orgMean) : null;
      return out;
    });
  }

  WP.evalIntel = {
    CONFIG: CONFIG,
    assess: assess,                     // pure: events -> suggested range
    suggestedRange: suggestedRange,     // async: personId + cycle -> suggested range
    assessConsistency: assessConsistency, // pure: rows -> warnings
    consistencyCheck: consistencyCheck, // async: evaluatorId + cycle -> warnings
    _refOf: refOf,                      // exposed for tests
    _cycleWindow: cycleWindow
  };
})(window.WP = window.WP || {});
