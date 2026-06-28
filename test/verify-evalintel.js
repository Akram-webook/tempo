/* Evaluation Intelligence (Intelligence Layer P3, ENGINE ONLY).
 * Gate: ai-os/00-governance/INTELLIGENCE-ETHICS.md — asserts all six points.
 *  - Human decides: output is a RANGE (never one number) + NO score/rating/rank/verdict field.
 *  - Evidence-first: sourceless events dropped; "not enough evidence yet" is first-class.
 *  - Support not surveil: only work/evidence categories consumed.
 *  - Transparent: every reasoning/warning/risk item carries evidence refs.
 *  - Dignity: warnings are awareness-only, never blocking, never a person-score.
 *  - Access-gated: a peer cannot pull another person's suggestion.
 * Backend mocked (no network). Loads the bundle exactly like verify-evalprep.js. */
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const srcs = [...html.matchAll(/src="([^"]+\.js)"/g)].map(m => m[1]);
const dom = new JSDOM('<!doctype html><html><body><div id="view"></div></body></html>', { url: 'https://localhost/', runScripts: 'outside-only' });
const { window } = dom;
window.HTMLElement.prototype.scrollIntoView = function () {};
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
const errors = [];
for (const s of srcs) { try { new window.Function(fs.readFileSync(path.join(root, s), 'utf8')).call(window); } catch (e) { errors.push('[load ' + s + '] ' + e.message); } }
const WP = window.WP;
if (WP) WP.render = function () {};   // async suite — neutralize deferred boot render
function assert(c, m) { if (!c) errors.push('[assert] ' + m); }

const NOW = '2026-05-15T00:00:00Z';
// a rich, sourced evidence set inside the active cycle (Q2 2026: 04-01..06-30)
function richEvents() {
  return [
    { id: 'd1', ts: '2026-04-03T00:00:00Z', category: 'delivery',    source: 'slack:#daily-checkin', confidence: 'high',     description: 'issued 40 tickets', evidenceRefs: ['https://slack/p1'] },
    { id: 'd2', ts: '2026-04-10T00:00:00Z', category: 'delivery',    source: 'slack:#daily-checkin', confidence: 'med',      description: 'closed defect', evidenceRefs: ['https://slack/p2'] },
    { id: 'd3', ts: '2026-04-18T00:00:00Z', category: 'delivery',    source: 'slack:#daily-checkin', confidence: 'high',     description: 'shipped report' },
    { id: 'r1', ts: '2026-04-20T00:00:00Z', category: 'recognition', source: 'Check-in / kudos',     confidence: 'recorded', description: 'Recognition: great save', growth: true },
    { id: 'r2', ts: '2026-04-22T00:00:00Z', category: 'recognition', source: 'Daily check-ins',      confidence: 'observed', description: 'Consistent check-ins', growth: true },
    { id: 'p1', ts: '2026-04-25T00:00:00Z', category: 'plan',        source: 'slack:#daily-checkin', confidence: 'med',      description: 'cross-sell defect tomorrow' },
    { id: 'k1', ts: '2026-04-26T00:00:00Z', category: 'risk',        source: 'slack:#daily-checkin', confidence: 'med',      description: 'waiting on design assets', evidenceRefs: ['https://slack/p3'] },
    { id: 'w1', ts: '2026-04-28T00:00:00Z', category: 'workload',    source: 'Capacity engine',     confidence: 'observed', description: 'Workload at 80% this period' },
    { id: 'x',  ts: '2026-04-29T00:00:00Z', category: 'delivery',    /* NO source */                                         description: 'fabricated — must be dropped' }
  ];
}

(async () => {
  try {
    assert(WP.evalIntel && WP.evalIntel.suggestedRange && WP.evalIntel.consistencyCheck, 'WP.evalIntel API present');
    assert(typeof WP.evalIntel.assess === 'function' && typeof WP.evalIntel.assessConsistency === 'function', 'pure helpers exposed');

    /* ===== suggestedRange (via pure assess) ===== */
    const s = WP.evalIntel.assess(richEvents(), {});

    // Human decides — NO single rating/rank/verdict field anywhere in the output.
    const banned = ['score', 'rating', 'rank', 'ranking', 'verdict', 'grade', 'overall', 'recommendation', 'decision'];
    banned.forEach(k => assert(!(k in s), 'human-decides: output must not contain a "' + k + '" field'));

    // The suggestion is a RANGE that never collapses to one number.
    assert(Array.isArray(s.range) && s.range.length === 2, 'suggestion is a [low,high] range');
    assert(s.range[0] < s.range[1], 'range never collapses to a single number (low < high)');
    assert(s.range[0] >= 1 && s.range[1] <= 5, 'range stays on the /5 scale');
    assert(s.enoughEvidence === true, 'rich input → enough evidence');

    // Evidence-first — the sourceless event is dropped; every cited item has a source.
    assert(s.total === 9 && s.sourcedCount === 8, 'sourceless event dropped (8 of 9 sourced)');
    assert(s.evidence.every(e => !!e.source), 'every evidence item carries a source');
    assert(WP.evalIntel._refOf({ description: 'no source' }) === null, '_refOf drops a sourceless event');

    // Transparent — every reasoning item AND every risk carries evidence refs.
    assert(s.reasoning.length > 0 && s.reasoning.every(r => Array.isArray(r.evidence) && r.evidence.length > 0), 'every reasoning item has evidence refs');
    assert(s.risks.length === 1 && s.risks.every(r => Array.isArray(r.evidence) && r.evidence.length > 0), 'risks surfaced (blocker) each with evidence refs');

    // Dignity — the open blocker is SURFACED as a risk, not silently deducted: the
    // anchor still reflects the positive delivery/recognition evidence.
    assert(s.range[1] >= 3.0, 'open blocker is surfaced, not used to quietly tank the score');

    // Sparse → "Not enough evidence yet" is a first-class result (no fabricated range).
    const sparse = WP.evalIntel.assess(richEvents().slice(0, 2), {});
    assert(sparse.enoughEvidence === false, 'sparse input → enoughEvidence:false');
    assert(sparse.range === null, 'sparse input → NO fabricated range');
    assert(sparse.reasoning.some(r => /not enough evidence/i.test(r.text)), 'sparse states "Not enough evidence yet"');
    // even sparse output obeys the every-item-has-evidence-refs contract
    assert(sparse.reasoning.every(r => Array.isArray(r.evidence)), 'sparse reasoning items still carry an evidence array');

    /* ===== consistencyCheck (via pure assessConsistency) ===== */
    // central tendency: tightly clustered mid-scores
    const central = WP.evalIntel.assessConsistency([
      { subjectId: 'a', overall: 3.0, evidenceCount: 5, refs: ['e1', 'e2'] },
      { subjectId: 'b', overall: 3.1, evidenceCount: 5, refs: ['e3'] },
      { subjectId: 'c', overall: 2.9, evidenceCount: 5, refs: ['e4'] }
    ], { orgMean: 3.6 });
    assert(central.enoughData === true, 'consistency: enough data with 3 reviews');
    const types = central.warnings.map(w => w.type);
    assert(types.indexOf('central-tendency') !== -1, 'flags central-tendency clustering');
    assert(types.indexOf('severity-skew') !== -1, 'flags severity skew vs org baseline');
    assert(central.warnings.every(w => Array.isArray(w.evidence) && w.evidence.length > 0), 'every warning carries evidence');
    assert(central.warnings.every(w => !!w.explanation), 'every warning carries an explanation');
    // Dignity — warnings are awareness-only: no person-score / rank field, no "blocking" flag.
    const wBanned = ['score', 'rank', 'ranking', 'verdict', 'grade', 'blocked', 'blocking'];
    central.warnings.forEach(w => wBanned.forEach(k => assert(!(k in w), 'warning must not contain a "' + k + '" field')));
    assert(central.warnings.every(w => /second look|worth/i.test(w.text)), 'warnings are framed "worth a second look", never accusatory');

    // evidence-mismatch: a high rating with little logged evidence
    const mismatch = WP.evalIntel.assessConsistency([
      { subjectId: 'a', overall: 4.6, evidenceCount: 0, refs: [] },
      { subjectId: 'b', overall: 3.2, evidenceCount: 7, refs: ['e1', 'e2'] }
    ], { orgMean: 3.5 });
    assert(mismatch.warnings.some(w => w.type === 'evidence-light-high'), 'flags a high rating that lacks logged evidence');

    // never warns on too little data (awareness needs at least a couple of reviews)
    const tiny = WP.evalIntel.assessConsistency([{ subjectId: 'a', overall: 3, evidenceCount: 5, refs: ['e'] }], {});
    assert(tiny.enoughData === false && tiny.warnings.length === 0, 'single review → no warnings (not enough to compare)');

    /* ===== ACCESS GATE (Ethics #6) — a peer can never pull another's suggestion ===== */
    const spec = WP.data.PEOPLE.find(p => p.level === 'spec' && !p.tbc);
    const peer = WP.data.PEOPLE.find(p => p.id !== spec.id && p.managerId === spec.managerId) || WP.data.PEOPLE.find(p => p.id !== spec.id);
    const blocked = await WP.evalIntel.suggestedRange(spec.id, null, { viewer: peer });
    assert(blocked.denied === true && blocked.range === null, 'gate: a peer is denied another person’s suggested range');
    assert(!('score' in blocked) && !('rating' in blocked), 'denied output stays free of any score/rating');
    const mgr = WP.access.byId(spec.managerId);
    if (mgr) {
      const ok = await WP.evalIntel.suggestedRange(spec.id, null, { viewer: mgr, refDate: '2026-06-27' });
      assert(ok && ok.denied !== true && typeof ok.enoughEvidence === 'boolean', 'gate: a direct manager may pull the suggestion');
      assert(!('score' in ok) && !('rating' in ok) && !('verdict' in ok), 'manager output stays prep-only (range, not a verdict)');
    }

    /* ===== store-backed async paths resolve (local fallback, no client) ===== */
    WP._sb = null;
    const someone = WP.data.PEOPLE.find(p => p.id === 'p_osama') || WP.data.PEOPLE[0];
    const ranged = await WP.evalIntel.suggestedRange(someone.id, 'q2_2026', { refDate: '2026-06-27' });
    assert(ranged && ranged.subjectId === someone.id && ranged.cycle === 'q2_2026', 'suggestedRange resolves cycle-scoped for the subject');
    assert(!('score' in ranged) && (ranged.range === null || (Array.isArray(ranged.range) && ranged.range[0] < ranged.range[1])), 'store-backed range is null or a true span — never one number');

    const director = WP.data.PEOPLE.find(p => (WP.access.directReports(p.id) || []).length > 0);
    if (director) {
      const cc = await WP.evalIntel.consistencyCheck(director.id, 'q2_2026', { refDate: '2026-06-27' });
      assert(cc && cc.evaluatorId === director.id && Array.isArray(cc.warnings), 'consistencyCheck resolves warnings array for the evaluator');
      assert(typeof cc.enoughData === 'boolean', 'consistencyCheck reports enoughData');
    }
  } catch (e) { errors.push('[run] ' + e.message + '\n' + e.stack); }

  if (errors.length) { console.log('FAIL\n' + errors.join('\n')); process.exit(1); }
  console.log('PASS — eval-intel: range never one number, "not enough evidence" first-class, no score/rank/verdict field, every reasoning/warning/risk cites evidence, awareness-only warnings, peer access-gated, store-backed.');
  process.exit(0);
})();
