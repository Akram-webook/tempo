/* Slack daily check-in ingest — unit test. Run: `node test/verify-slack-ingest.js`
 * Pure module; loaded with a tiny window shim (same pattern as engine.test.js). */
global.window = {};
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
function load(f) { eval(fs.readFileSync(path.join(root, f), 'utf8')); }
load('src/js/core/slackIngest.js');
const SI = global.window.WP.slackIngest;

let failed = 0;
function check(name, got, exp) {
  const ok = JSON.stringify(got) === JSON.stringify(exp);
  if (!ok) failed++;
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + '  → ' + JSON.stringify(got) + (ok ? '' : '  (expected ' + JSON.stringify(exp) + ')'));
}
function ok(name, cond) { if (!cond) failed++; console.log((cond ? 'PASS' : 'FAIL') + '  ' + name); }

/* 1) Form-perfect post with counts ----------------------------------------- */
const form = [
  'Daily Check-in — Osama Taher — 2026-06-27',
  'Done today:',
  '- issued 40 tickets',
  '- handled 5 client requests',
  'Blockers / need help:',
  '- waiting on design assets for Stage A',
  'Tomorrow:',
  '- close the MotoGP cross-sell defect'
].join('\n');
const p1 = SI.parseCheckin(form);
ok('1a recognised as check-in', p1.isCheckin === true);
check('1b name parsed', p1.name, 'Osama Taher');
check('1c date parsed', p1.date, '2026-06-27');
check('1d done lines', p1.done.length, 2);
check('1e blockers lines', p1.blockers.length, 1);
check('1f tomorrow lines', p1.tomorrow.length, 1);

/* 2) Counts extraction ------------------------------------------------------ */
check('2a issued 40 tickets', SI.extractCounts('issued 40 tickets'), [{ n: 40, unit: 'tickets' }]);
check('2b created 3 matches', SI.extractCounts('created 3 matches'), [{ n: 3, unit: 'matches' }]);
check('2c no number → []', SI.extractCounts('reviewed the roadmap'), []);

/* 3) Blockers "none" → no risk --------------------------------------------- */
const noneText = ['Daily Check-in — Gamal — 2026-06-27', 'Done today:', '- shipped report', 'Blockers / need help:', '- none', 'Tomorrow:', '- QA pass'].join('\n');
const p3 = SI.parseCheckin(noneText);
check('3a none → 0 blockers', p3.blockers.length, 0);

/* 4) Unfilled template (parenthesised hints) → no junk events --------------- */
const unfilled = [
  'Daily Check-in — [Your name] — [Date]',
  'Done today:',
  '- (what you completed; add counts where they exist — e.g. "issued 40 tickets")',
  'Blockers / need help:',
  '- (anything stuck, or "none")',
  'Tomorrow:',
  '- (your main focus)'
].join('\n');
const p4 = SI.parseCheckin(unfilled);
ok('4a still recognised as a check-in', p4.isCheckin === true);
check('4b hint lines dropped (done)', p4.done.length, 0);
check('4c hint lines dropped (blockers)', p4.blockers.length, 0);
check('4d hint lines dropped (tomorrow)', p4.tomorrow.length, 0);

/* 5) Hand-typed, no bullets, lowercase labels ------------------------------- */
const handTyped = ['daily checkin - Talal - today', 'done today', 'fixed two bugs', 'blockers', 'none', 'tomorrow', 'pair with Osama'].join('\n');
const p5 = SI.parseCheckin(handTyped);
ok('5a parsed without bullets', p5.isCheckin === true && p5.done.length === 1 && p5.tomorrow.length === 1);
check('5b none still suppresses risk', p5.blockers.length, 0);

/* 6) Noise / non-check-in → unparseable ------------------------------------ */
const noise = SI.parseCheckin('hey team, can someone review my PR when free? thanks 🙏');
ok('6a random message is unparseable', noise.isCheckin === false && noise.unparseable === true);
ok('6b empty input unparseable', SI.parseCheckin('').unparseable === true);

/* 7) toEvents mapping + categories + counts + dedupe + permalink ----------- */
const ctx = { subjectId: 'p_osama', permalink: 'https://slack.com/archives/C1/p123', ts: '1782900000.0001', checkinId: 'chk_osama_0627', confidence: 'high' };
const evs = SI.toEvents(p1, ctx);
check('7a one event per line (2+1+1)', evs.length, 4);
check('7b done → delivery', evs[0].category, 'delivery');
check('7c blocker → risk', evs[2].category, 'risk');
check('7d tomorrow → plan', evs[3].category, 'plan');
ok('7e delivery carries metrics', Array.isArray(evs[0].metrics) && evs[0].metrics[0].n === 40);
ok('7f risk has NO metrics', evs[2].metrics === undefined);
ok('7g every event carries source', evs.every(e => e.source === 'slack:#daily-checkin'));
ok('7h every event carries permalink (no fabrication)', evs.every(e => e.evidenceRefs.length === 1));
ok('7i confidence passed through', evs.every(e => e.confidence === 'high'));
ok('7j subjectId stamped', evs.every(e => e.subjectId === 'p_osama'));
const keys = evs.map(e => e.dedupeKey);
ok('7k dedupe keys unique', new Set(keys).size === keys.length);

/* 8) toEvents refuses to emit without a resolved person (fail closed) ------- */
check('8a no subjectId → no events', SI.toEvents(p1, { permalink: 'x', ts: '1' }), []);

/* 9) Arabic check-in parses (bonus) ---------------------------------------- */
const ar = ['التحديث اليومي — طلال — 2026-06-27', 'أنجزت اليوم:', '- أصدرت 40 تذكرة', 'عوائق:', '- لا شيء', 'الغد:', '- مراجعة'].join('\n');
const p9 = SI.parseCheckin(ar);
ok('9a AR recognised', p9.isCheckin === true);
ok('9b AR done captured', p9.done.length === 1);
check('9c AR none → 0 blockers', p9.blockers.length, 0);

console.log('\n' + (failed ? failed + ' FAILED' : 'ALL PASS'));
process.exit(failed ? 1 : 0);
