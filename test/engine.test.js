/* Capacity engine unit test — run: `node test/engine.test.js`
 * No framework; pure-function engine is loaded with a tiny window shim. */
global.window = {};
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
function load(f) { eval(fs.readFileSync(path.join(root, f), 'utf8')); }
load('src/js/data/mock-data.js');
load('src/js/core/capacity.js');
const WP = global.window.WP;
const ref = '2026-06-17';
const snap = id => WP.capacity.snapshot(WP.data.PEOPLE.find(p => p.id === id), 'month', ref);
const m = WP.capacity.teamMetrics(WP.data.PEOPLE, 'month', ref);

const checks = [
  ['empty load = available', snap('p_ahmed').state.key, 'available'],
  ['Tier1 = 50% balanced', snap('p_motaa').load, 50],
  ['T1+T2 = 75% (top of balanced)', snap('p_akram').load, 75],
  ['T1+T2+T3 = 85% near', snap('p_osama').load, 85],
  ['overlap → burnout signal', snap('p_osama').burnout, true],
  ['far-apart events → no burnout', snap('p_abdulrahman').burnout, false],
  // teamHealth = round(healthyCount / size * 100). Assert it MATCHES the formula rather than
  // a magic constant, so it doesn't go stale every time the seeded loads change.
  ['team health = round(healthy/size)', m.teamHealth, Math.round(m.healthyCount / m.size * 100)],
];

let failed = 0;
checks.forEach(([name, got, exp]) => {
  const ok = got === exp;
  if (!ok) failed++;
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + '  → ' + got + (ok ? '' : ' (expected ' + exp + ')'));
});

// Regression: an event with an UNKNOWN tier (not 1/2/3) must NOT crash the load math.
// Before the fix, TIERS[ev.tier].weight threw on a bad tier, taking down the whole map.
// It should now be treated as zero-weight (fail-safe) rather than throwing.
(function tierGuard() {
  const p = { id: 'p_tier_test', assignedEvents: ['e_badtier'] };
  WP.data.EVENTS.e_badtier = { id: 'e_badtier', tier: 99, start: ref, end: ref };
  let threw = false, load = null;
  try { load = WP.capacity.loadForPerson(p, 'month', ref); } catch (e) { threw = true; }
  const ok = !threw && load === 0;
  if (!ok) failed++;
  console.log((ok ? 'PASS' : 'FAIL') + '  unknown tier → no crash, zero load  → ' + (threw ? 'THREW' : load));
  // And a normal tier still contributes after the guard (guard didn't break the happy path).
  WP.data.EVENTS.e_goodtier = { id: 'e_goodtier', tier: 1, start: ref, end: ref };
  const load2 = WP.capacity.loadForPerson({ id: 'x', assignedEvents: ['e_goodtier'] }, 'month', ref);
  const ok2 = load2 > 0;
  if (!ok2) failed++;
  console.log((ok2 ? 'PASS' : 'FAIL') + '  known tier still contributes load  → ' + load2);
  delete WP.data.EVENTS.e_badtier; delete WP.data.EVENTS.e_goodtier;
})();

// Regression: custom from→to window (workload-map date filter). Bounds come from
// WP.state; the range reads as an average monthly load (divisor = months spanned).
// Chaos cases that once could break it: inverted bounds, and missing/invalid bounds.
(function customWindow() {
  const eq = (name, got, exp) => { const ok = got === exp; if (!ok) failed++; console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + '  → ' + got + (ok ? '' : ' (expected ' + exp + ')')); };
  const D = (y, mo, d) => Date.UTC(y, mo, d);
  // A single calendar month → divisor 1, exact bounds.
  WP.state = { customFrom: '2026-06-01', customTo: '2026-06-30' };
  let b = WP.capacity.windowBounds('custom', ref);
  eq('custom: start bound', b.start, D(2026, 5, 1));
  eq('custom: end bound', b.end, D(2026, 5, 30));
  eq('custom: ~1 month → divisor 1', b.divisor, 1);
  // Inverted bounds (To before From) must SWAP, not break.
  WP.state = { customFrom: '2026-06-30', customTo: '2026-06-01' };
  b = WP.capacity.windowBounds('custom', ref);
  eq('custom inverted: swapped start', b.start, D(2026, 5, 1));
  eq('custom inverted: swapped end', b.end, D(2026, 5, 30));
  // A 3-month span → divisor 3 (averaged).
  WP.state = { customFrom: '2026-04-01', customTo: '2026-06-30' };
  eq('custom 3-month → divisor 3', WP.capacity.windowBounds('custom', ref).divisor, 3);
  // Missing/invalid bounds → safe fallback to the month window (never NaN/broken).
  WP.state = {};
  const fb = WP.capacity.windowBounds('custom', ref), mo = WP.capacity.windowBounds('month', ref);
  eq('custom no-bounds → month fallback (start)', fb.start, mo.start);
  eq('custom no-bounds → month fallback (end)', fb.end, mo.end);
  WP.state = undefined;
})();

console.log('\n' + (failed ? failed + ' FAILED' : 'ALL PASS'));
process.exit(failed ? 1 : 0);
