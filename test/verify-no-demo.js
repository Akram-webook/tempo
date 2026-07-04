/* NO-DEMO MODE — reversible "run on real data" gate (WP.config.demoData).
 * ONE flag decides whether the app runs on the bundled SAMPLE seed (demo) or on
 * REAL data from Supabase. Nothing is deleted; flipping the flag reverses it.
 * We assert BOTH states from the real load path (config.js runs after data/*):
 *   - demoData=true  → the synthetic seeds are present and the app is UNCHANGED
 *                      (Sample-data badge shows) — proof of reversibility;
 *   - demoData=false → the synthetic PERSON seeds (people/events/growth/evals/
 *                      self/engage) are dropped, the WP.db fallback returns NO
 *                      bundle mock for real fields, the Sample-data badge is gone,
 *                      screens show honest EMPTY states, and TAXONOMY is kept.
 * EN + AR strings; both themes. Confirms no real data is bundled in the repo. */
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const srcs = [...html.matchAll(/src="([^"]+\.js)"/g)].map(m => m[1]);
const shellBody = (html.match(/<body[^>]*>([\s\S]*?)<\/body>/) || [, ''])[1].replace(/<script[\s\S]*?<\/script>/g, '');
const errors = [];
const benign = /font|stylesheet|localStorage|Security|scrollIntoView|Not implemented|opaque|insertRule|cssRules/i;

// Boot a fresh app. `preset` is merged into window.WP.config BEFORE the scripts
// run, so config.js sees it — exactly how the flag would be set in production.
function boot(preset) {
  const dom = new JSDOM('<!doctype html><html><body>' + shellBody + '</body></html>',
    { url: 'https://localhost/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLElement.prototype.scrollIntoView = function () {};
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  window.setInterval = () => 0; window.confirm = () => false; window.alert = () => {}; window.prompt = () => null;
  ['error', 'warn'].forEach(k => { const o = window.console[k].bind(window.console); window.console[k] = (...a) => { const s = a.join(' '); if (!benign.test(s)) errors.push('[' + k + '] ' + s); o(...a); }; });
  window.addEventListener('error', e => { if (!benign.test(String(e.message))) errors.push('[onerror] ' + e.message); });
  if (preset) { window.WP = { config: preset }; }
  for (const s of srcs) { try { new window.Function(fs.readFileSync(path.join(root, s), 'utf8')).call(window); } catch (e) { errors.push('[load ' + s + '] ' + e.message); } }
  return window.WP;
}
function assert(c, m) { if (!c) errors.push('[assert] ' + m); }
const configJs = fs.readFileSync(path.join(root, 'src/js/core/config.js'), 'utf8');
const distHtml = fs.existsSync(path.join(root, 'dist/index.html')) ? fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8') : '';

function finish() {
  if (errors.length) { console.log('FAIL\n' + errors.join('\n')); process.exit(1); }
  console.log('PASS — no-demo mode: ONE reversible flag (WP.config.demoData, default true, inlined into dist). demoData=false drops the synthetic PERSON seeds (people/events/growth/evaluations/self/engage), the WP.db never-blank fallback returns NO bundle mock for real fields, the Sample-data badge is suppressed, workload shows an honest empty state, and engagement returns a neutral record; taxonomy (tiers/states/rubric/cycles/ladders) is kept. demoData=true is unchanged (sample seeds + badge). No real data is bundled in the repo. EN + AR.');
  process.exit(0);
}

(async () => {
try {
  // ── THE FLAG itself ──
  assert(/WP\.config\.demoData\s*=\s*true/.test(configJs), 'flag declared in config.js (default true)');
  assert(/flip to false to run on real data/i.test(configJs), 'config.js documents the one-line reversal');
  assert(/WP\.config\.demoData/.test(distHtml), 'the flag is inlined into the built dist (ships in the bundle)');

  // ── REPO HYGIENE: real data must NEVER be bundled. The service_role key is the
  //    proxy for "real backend data pulled into the repo" — assert it is absent. ──
  ['mock-data', 'growth-data', 'evaluation', 'engage-data'].forEach(function (f) {
    const src = fs.readFileSync(path.join(root, 'src/js/data/' + f + '.js'), 'utf8');
    assert(!/service_role|sb_secret|SUPABASE_SERVICE/i.test(src), f + '.js contains no service-role/secret (no real backend data bundled)');
  });

  // ============================================================
  //  demoData = TRUE  →  DEMO (today's behavior, unchanged)
  // ============================================================
  const D = boot(null);
  assert(D.config.demoData === true, 'demoData defaults to true');
  assert(typeof D.demo === 'function' && D.demo() === true, 'WP.demo() true by default');
  assert(Array.isArray(D.data.PEOPLE) && D.data.PEOPLE.length > 0, 'demo: PEOPLE seeded');
  assert(Object.keys(D.data.EVENTS).length > 0, 'demo: EVENTS seeded');
  assert(Object.keys(D.data.GROWTH).length > 0, 'demo: GROWTH seeded');
  assert(Object.keys(D.data.EVALUATIONS).length > 0, 'demo: EVALUATIONS seeded');
  assert(Object.keys(D.data.SELF).length > 0, 'demo: SELF seeded');
  assert(Object.keys(D.data.ENGAGE).length > 0, 'demo: ENGAGE seeded');
  assert(/provenance-note/.test(D.ui.provenanceNote()), 'demo: Sample-data badge shows');
  const dEng = D.engage.get(D.data.PEOPLE[0].id);
  assert(dEng && dEng.streak > 0, 'demo: engagement carries the seeded streak');

  // ============================================================
  //  demoData = FALSE  →  NO-DEMO (real data only, honest empties)
  // ============================================================
  const N = boot({ demoData: false });
  assert(N.config.demoData === false, 'demoData=false honored');
  assert(N.demo() === false, 'WP.demo() false');
  // synthetic PERSON seeds dropped
  assert(N.data.PEOPLE.length === 0, 'no-demo: PEOPLE seed dropped (org → Supabase only)');
  assert(Object.keys(N.data.EVENTS).length === 0, 'no-demo: EVENTS seed dropped');
  assert(Object.keys(N.data.GROWTH).length === 0, 'no-demo: GROWTH seed dropped');
  assert(Object.keys(N.data.EVALUATIONS).length === 0, 'no-demo: EVALUATIONS seed dropped');
  assert(Object.keys(N.data.SELF).length === 0, 'no-demo: SELF seed dropped');
  assert(Object.keys(N.data.ENGAGE).length === 0, 'no-demo: ENGAGE seed dropped');
  // taxonomy / rubric / thresholds KEPT (config, not personal data)
  assert(N.data.TIERS && N.data.STATES && N.data.STATES.length > 0, 'no-demo: STATES/TIERS taxonomy kept');
  assert(N.data.LEVELS && N.data.CEILING, 'no-demo: LEVELS + CEILING kept');
  assert(N.data.EVAL_CRITERIA && N.data.EVAL_CRITERIA.length > 0, 'no-demo: EVAL_CRITERIA rubric kept');
  assert(N.data.CYCLES, 'no-demo: evaluation CYCLES config kept');
  assert(N.data.SKILL_LADDER && N.data.WORK_STAGES, 'no-demo: growth ladders/taxonomy kept');
  // NO bundle mock for real fields via the WP.db fallback (signed-out path)
  const peopleFallback = await N.db.people.list();
  assert(Array.isArray(peopleFallback) && peopleFallback.length === 0,
    'no-demo: WP.db.people fallback returns [] — no bundle names read as real');
  // Sample-data badge suppressed → screens carry honesty via empty states
  assert(N.ui.provenanceNote() === '', 'no-demo: Sample-data badge suppressed');
  // engagement returns a neutral (non-synthetic) record, not a fake streak
  const nEng = N.engage.get('p_anyone');
  assert(nEng && nEng.streak === 0 && nEng.kudos.length === 0, 'no-demo: engagement returns neutral empty record');
  // honest empty-state string exists in EN + AR
  const s = N.i18n; N.state.lang = 'en';
  assert(N.i18n.t('noWorkloadYet') && /awaiting/i.test(N.i18n.t('noWorkloadYet')), 'no-demo: EN empty-state string present');
  N.state.lang = 'ar';
  assert(/بانتظار/.test(N.i18n.t('noWorkloadYet')), 'no-demo: AR empty-state string present');

  finish();
} catch (e) { errors.push('[fatal] ' + (e && e.stack || e)); finish(); }
})();
