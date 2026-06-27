/* AI Evaluation Preparation (Intelligence Layer P2). Gate: INTELLIGENCE-ETHICS.md.
 * Tests the hard guardrails: NO fabrication (sourceless lines dropped; every line
 * sourced), gaps LISTED not filled, "not enough evidence" when sparse, NO
 * score/rating/verdict in the output, manager-gated access, and that prepare()
 * reads the append-only event store. Backend mocked (no network). */
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

// a small, realistic sourced event set (5 sourced) + 1 sourceless decoy
function sampleEvents() {
  return [
    { id: 'e1', ts: '2026-05-01T00:00:00Z', category: 'workload',    source: 'Capacity engine',   description: 'Workload at 80% this period', confidence: 'observed' },
    { id: 'e2', ts: '2026-05-10T00:00:00Z', category: 'recognition', source: 'Check-in / kudos',   description: 'Recognition: great save', growth: true },
    { id: 'e3', ts: '2026-05-12T00:00:00Z', category: 'recognition', source: 'Daily check-ins',    description: 'Consistent check-ins', growth: true },
    { id: 'e4', ts: '2026-05-20T00:00:00Z', category: 'evaluation',  source: 'Evaluation',         description: 'Evaluation completed (Q1)' },
    { id: 'e5', ts: '2026-05-22T00:00:00Z', category: 'decision',    source: 'Activity log',       description: 'role change · promotion' },
    { id: 'x',  ts: '2026-05-25T00:00:00Z', category: 'workload',    /* NO source */               description: 'fabricated line that must be dropped' }
  ];
}

(async () => {
  try {
    assert(WP.evalPrep && WP.evalPrep.summarize && WP.evalPrep.prepare, 'WP.evalPrep API present');

    // --- PREP ONLY: the output carries NO score/rating/verdict/recommendation ---
    const s = WP.evalPrep.summarize(sampleEvents(), {});
    const banned = ['score', 'rating', 'verdict', 'recommendation', 'overall', 'grade'];
    banned.forEach(function (k) { assert(!(k in s), 'prep-only: output must not contain "' + k + '"'); });

    // --- NO fabrication: the sourceless event is dropped; every line has a source ---
    assert(s.total === 6 && s.sourcedCount === 5, 'sourceless event dropped (5 of 6 sourced)');
    const allLines = s.sections.reduce(function (a, sec) { return a.concat(sec.lines); }, []);
    assert(allLines.length === 5, 'only sourced lines surface');
    assert(allLines.every(function (l) { return !!l.source; }), 'every prep line carries a source');
    assert(WP.evalPrep._lineOf({ description: 'no source' }) === null, 'lineOf drops a sourceless event');

    // --- gaps are LISTED, not filled: wellbeing has no evidence here ---
    const gapCats = s.gaps.map(function (g) { return g.category; });
    assert(gapCats.indexOf('wellbeing') !== -1, 'empty category (wellbeing) is listed as a gap');
    assert(s.sections.every(function (sec) { return sec.lines.length > 0; }), 'no empty section is fabricated');

    // --- growth highlights are surfaced (and sourced) ---
    assert(s.highlights.length === 2 && s.highlights.every(function (l) { return l.source; }), 'growth highlights surfaced + sourced');

    // --- "not enough evidence" when sparse (below minEvidence) ---
    const sparse = WP.evalPrep.summarize(sampleEvents().slice(0, 2), {});
    assert(sparse.enough === false, 'sparse input → not enough evidence');
    assert(s.enough === true, 'sufficient input → enough = true');
    // even when sparse, what little exists is still sourced (no stretching)
    assert(sparse.sourcedCount === 2 && sparse.gaps.length >= 1, 'sparse still lists gaps, no fabrication');

    // --- ACCESS GATE: a peer can never see another person's prep ---
    const spec = WP.data.PEOPLE.find(p => p.level === 'spec' && !p.tbc);
    const peer = WP.data.PEOPLE.find(p => p.id !== spec.id && p.managerId === spec.managerId) || WP.data.PEOPLE.find(p => p.id !== spec.id);
    assert(WP.access.canSeeSensitive(spec, peer.id) === false, 'gate: a peer cannot see another peer’s eval prep');
    const mgr = WP.access.byId(spec.managerId);
    if (mgr) assert(WP.access.canSeeSensitive(mgr, spec.id) === true, 'gate: a direct manager can see their report’s prep');

    // --- prepare() reads the store and resolves a summary (local fallback, no client) ---
    WP._sb = null;
    const someone = WP.data.PEOPLE.find(p => (p.assignedEvents || []).length > 0) || WP.data.PEOPLE[0];
    const prepared = await WP.evalPrep.prepare(someone.id, {}, '2026-06-27');
    assert(prepared && typeof prepared.enough === 'boolean' && prepared.subjectId === someone.id, 'prepare resolves a summary for the subject');
    assert(!('score' in prepared) && !('rating' in prepared), 'prepare output stays prep-only (no score/rating)');
    assert(Array.isArray(prepared.sections) && Array.isArray(prepared.gaps), 'prepare returns sections + gaps');
  } catch (e) { errors.push('[run] ' + e.message + '\n' + e.stack); }

  if (errors.length) { console.log('FAIL\n' + errors.join('\n')); process.exit(1); }
  console.log('PASS — eval-prep: prep-only (no score/verdict), no fabrication (every line sourced), gaps listed not filled, “not enough evidence” when sparse, manager-gated, store-backed.');
  process.exit(0);
})();
