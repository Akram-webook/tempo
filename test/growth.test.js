/* Growth analytics test — run: `node test/growth.test.js` */
global.window = {};
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const load = f => eval(fs.readFileSync(path.join(root, f), 'utf8'));
load('src/js/data/mock-data.js');
load('src/js/data/growth-data.js');
load('src/js/core/capacity.js');
load('src/js/core/growth.js');
const WP = global.window.WP;
WP.state = { refDate: '2026-06-17', window: 'month' };
const P = id => WP.data.PEOPLE.find(p => p.id === id);

const checks = [
  ['Osama flagged as retention risk', WP.growth.flightRisk(P('p_osama')).risk, true],
  ['Osama strong promotion readiness (>=80%)', WP.growth.promotionReadiness(P('p_osama')).pct >= 80, true],
  ['Talal fairness gap (never given Tier-1)', WP.growth.promotionReadiness(P('p_talal')).fairnessGap, true],
  ['Idris is a ramping new hire', WP.growth.isRamping(P('p_idris')), true],
  ['Motaa not a retention risk', WP.growth.flightRisk(P('p_motaa')).risk, false],
];

let failed = 0;
checks.forEach(([n, got, exp]) => {
  const ok = got === exp;
  if (!ok) failed++;
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + '  → ' + got + (ok ? '' : ' (expected ' + exp + ')'));
});
console.log('\n' + (failed ? failed + ' FAILED' : 'ALL ' + checks.length + ' PASS'));
process.exit(failed ? 1 : 0);
