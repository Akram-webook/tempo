/* Workload cockpit engine — verify the LOCKED MVP model (per-day load, forecast,
 * pressure, pressure windows, drivers, skill-aware what-if). Pure engine, tiny window
 * shim (same pattern as engine.test.js). Run: node test/verify-workload.js
 *
 * Covers the brief's §29 matrix, adapted to the tier-weight (no-hours) model:
 *   day-load (zero / single / multiple / overlap / past / unknown-tier),
 *   5-level state bands, forecast (future / concentrated / none), pressure (+factors),
 *   what-if (fits / increases / overload soft-lock / skill mismatch / critical overlap),
 *   and the demo scenario invariants (Adam / Owen / Kevin).
 */
global.window = {};
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
function load(f) { eval(fs.readFileSync(path.join(root, f), 'utf8')); }
load('src/js/data/mock-data.js');
load('src/js/core/capacity.js');   // provides WP.dates
load('src/js/core/workload.js');
const WP = global.window.WP;
const W = WP.workload;
const P = id => WP.data.PEOPLE.find(p => p.id === id);
const REF = WP.data.DEMO_TODAY;    // '2026-08-19'

let failed = 0;
function eq(name, got, exp) {
  const ok = got === exp; if (!ok) failed++;
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + '  → ' + got + (ok ? '' : ' (expected ' + exp + ')'));
}
function ok(name, cond, detail) {
  if (!cond) failed++;
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (detail != null ? '  → ' + detail : ''));
}

// ── Synthetic fixtures (isolated events; do not touch the demo directory) ──
WP.data.EVENTS.t_mega = { id: 't_mega', tier: 1, start: '2026-08-19', end: '2026-08-20' };  // 2-day Mega
WP.data.EVENTS.t_mega2 = { id: 't_mega2', tier: 1, start: '2026-08-19', end: '2026-08-20' }; // overlapping Mega
WP.data.EVENTS.t_med = { id: 't_med', tier: 2, start: '2026-08-19', end: '2026-08-30' };
WP.data.EVENTS.t_past = { id: 't_past', tier: 1, start: '2026-06-01', end: '2026-06-10' };   // past
WP.data.EVENTS.t_bad = { id: 't_bad', tier: 99, start: '2026-08-19', end: '2026-08-20' };    // unknown tier
WP.data.EVENTS.t_fut = { id: 't_fut', tier: 1, start: '2026-08-26', end: '2026-08-27' };     // future-only

const P0 = { id: 'x0', assignedEvents: [] };
const P1 = { id: 'x1', assignedEvents: ['t_mega'] };
const P2 = { id: 'x2', assignedEvents: ['t_mega', 't_mega2'] };          // 100 on Aug19-20
const P3 = { id: 'x3', assignedEvents: ['t_mega', 't_med'] };            // 75 Aug19-20, 25 after
const Ppast = { id: 'xp', assignedEvents: ['t_past'] };
const Pbad = { id: 'xb', assignedEvents: ['t_bad'] };
const Pconc = { id: 'xc', assignedEvents: ['t_mega', 't_mega2'] };       // concentrated: 100 for 2 days only

// ── 1. Day-load (demand) ──
eq('zero load = 0', W.dayLoad(P0, REF), 0);
eq('single Mega day = 50', W.dayLoad(P1, REF), 50);
eq('two overlapping Megas = 100', W.dayLoad(P2, REF), 100);
eq('Mega+Medium = 75', W.dayLoad(P3, REF), 75);
eq('past event → 0 today', W.dayLoad(Ppast, REF), 0);
eq('unknown tier → 0 (fail-safe)', W.dayLoad(Pbad, REF), 0);
ok('unknown tier does not throw', (function () { try { W.dayLoad(Pbad, REF); return true; } catch (e) { return false; } })());

// ── 2. State bands (5-level, boundaries) ──
eq('0 → healthy', W.stateFor(0).key, 'healthy');
eq('70 → healthy (top)', W.stateFor(70).key, 'healthy');
eq('71 → watch', W.stateFor(71).key, 'watch');
eq('85 → watch (top)', W.stateFor(85).key, 'watch');
eq('86 → high', W.stateFor(86).key, 'high');
eq('100 → high (top)', W.stateFor(100).key, 'high');
eq('101 → overloaded', W.stateFor(101).key, 'overloaded');
eq('115 → overloaded (top)', W.stateFor(115).key, 'overloaded');
eq('116 → critical', W.stateFor(116).key, 'critical');
eq('999 → critical', W.stateFor(999).key, 'critical');

// ── 3. Forecast: future work, concentration (the anti-smoothing guarantee), none ──
const fFut = W.forecast({ id: 'xf', assignedEvents: ['t_fut'] }, REF);
eq('future-only: today 0', fFut.today, 0);
eq('future-only: peak14 = 50', fFut.peak14, 50);
eq('future-only: peak lands Aug26', fFut.peak14Date, '2026-08-26');
const fConc = W.forecast(Pconc, REF);
ok('concentrated: peak (100) >> avg14 — peak is NOT smoothed away', fConc.peak14 === 100 && fConc.avg14 < 30, 'peak=' + fConc.peak14 + ' avg14=' + fConc.avg14);
const fNone = W.forecast(P0, REF);
ok('no work: peak 0', fNone.peak14 === 0);
eq('timeline length = horizon 14', W.timeline(P0, REF).length, 14);

// ── 4. Pressure (transparent, factor-visible) ──
const prNone = W.pressure(P0, REF);
eq('empty person → low pressure', prNone.level, 'low');
ok('pressure exposes factors (peakLoad/concurrency/deadline/mega)',
  prNone.factors && 'peakLoad' in prNone.factors && 'maxConcurrent' in prNone.factors && 'megaActive' in prNone.factors);

// ── 5. What-if ──
const simFit = W.simulate(P0, 't_med', REF);   // 0 → 25
ok('what-if FITS: not soft-locked', simFit.afterPeak === 25 && simFit.softLocked === false, 'after=' + simFit.afterPeak);
const simInc = W.simulate(P1, 't_med', REF);
ok('what-if INCREASES load', simInc.afterPeak > simInc.beforePeak, simInc.beforePeak + '→' + simInc.afterPeak);
const simOver = W.simulate(P2, 't_med', REF);   // 100 + 25 = 125 → overload
ok('what-if OVERLOAD → soft-locked', simOver.afterPeak > 100 && simOver.softLocked === true, 'after=' + simOver.afterPeak);

// skill mismatch: rank candidates for a cashless-required event
WP.data.EVENTS.t_cash = { id: 't_cash', tier: 2, start: '2026-08-19', end: '2026-08-22', requiredSkill: 'cashless' };
const cands = W.rankCandidates('t_cash', [P('p_saleh'), P('p_talal'), P('p_motaa')], REF); // Simon=logistics, Tyler=cashless, Marco=ticketing/av
eq('skill-aware: top candidate is the cashless-skilled Tyler', cands[0].id, 'p_talal');
ok('skill-aware: Tyler recommended', cands[0].recommended === true);
ok('skill-aware: non-cashless Simon is skill-mismatched', cands.find(c => c.id === 'p_saleh').skillMatch === false);
ok('skill-aware: skilled ranked above unskilled', cands.findIndex(c => c.id === 'p_talal') < cands.findIndex(c => c.id === 'p_saleh'));

// critical overlap guard
ok('createsCritical: adding Super Cup to Owen tips critical', W.createsCritical(P('p_osama'), WP.data.EVENTS.e_supercup, REF));

// ── 6. Demo scenario invariants (the story the manager must see) ──
const adam = W.snapshot(P('p_akram'), REF);
eq('Adam today = 110 (Overloaded now)', adam.today, 110);
eq('Adam todayState Overloaded', adam.todayState.key, 'overloaded');
eq('Adam peak14 = 110 (Overloaded)', adam.peak14, 110);
const owen = W.snapshot(P('p_osama'), REF);
eq('Owen today = 110 (Overloaded now)', owen.today, 110);
eq('Owen peak14 = 125 (Critical)', owen.peak14, 125);
eq('Owen peaks Aug 24 (future critical)', owen.peak14Date, '2026-08-24');
eq('Owen peakState critical', owen.peak14State.key, 'critical');
const kevin = W.snapshot(P('p_khaled'), REF);
eq('Kevin today = 25 (Healthy now)', kevin.today, 25);
eq('Kevin todayState healthy', kevin.todayState.key, 'healthy');
eq('Kevin peak7 = 100 (climbs to High next week)', kevin.peak7, 100);

// ── 7. Team roll-up + pressure windows + drivers ──
const tm = W.teamMetrics(WP.data.PEOPLE, REF);
ok('team: ≥2 overloaded/critical today', tm.overloadedToday >= 2, tm.overloadedToday);
ok('team: ≥1 at-risk within 7d', tm.atRisk7 >= 1, tm.atRisk7);
ok('team: avgToday is a plain integer 0..999', Number.isInteger(tm.avgToday) && tm.avgToday >= 0);
const win = W.pressureWindows(WP.data.PEOPLE, REF, 5);
ok('pressure windows: at least one High+ window found', win.length >= 1, win.length);
ok('window carries drivers + an action', win[0] && win[0].drivers.length >= 1 && !!win[0].action);
const drv = W.driversRollup(WP.data.PEOPLE, REF, 3);
ok('drivers roll-up: top driver has demand + peopleCount', drv[0] && drv[0].demand > 0 && drv[0].peopleCount >= 1,
  drv[0] && (drv[0].id + ' demand=' + drv[0].demand + ' people=' + drv[0].peopleCount));

// cleanup synthetic fixtures
['t_mega', 't_mega2', 't_med', 't_past', 't_bad', 't_fut', 't_cash'].forEach(id => { delete WP.data.EVENTS[id]; });

console.log('\n' + (failed
  ? failed + ' FAILED — verify-workload'
  : 'PASS — workload cockpit engine: per-day load (zero/single/overlap/past/unknown-tier), 5-level bands, forecast (future/concentrated/none, peak never smoothed), pressure with visible factors, what-if (fits/increases/overload soft-lock/skill-mismatch/critical-overlap), demo scenario invariants (Adam 100→110 Overloaded, Owen 100→125 Critical, Kevin 25→100), and team metrics + pressure windows + drivers.'));
process.exit(failed ? 1 : 0);
