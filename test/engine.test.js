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
  ['team health = % balanced', m.teamHealth, 14],
];

let failed = 0;
checks.forEach(([name, got, exp]) => {
  const ok = got === exp;
  if (!ok) failed++;
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + '  → ' + got + (ok ? '' : ' (expected ' + exp + ')'));
});
console.log('\n' + (failed ? failed + ' FAILED' : 'ALL ' + checks.length + ' PASS'));
process.exit(failed ? 1 : 0);
