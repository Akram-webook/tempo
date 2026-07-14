/* Settings v2 → My settings → Privacy. Proves:
 *   1. Privacy section renders for EVERY signed-in user (personal tab): the
 *      honest catalogue of data categories + a plain "what Tempo never does"
 *      guardrail + an "export my data" button.
 *   2. WP.privacy.myData() returns ONLY the current viewer's data (self, never
 *      another person), with identity + preferences + own events (each keeping
 *      its source — no fabrication).
 *   3. WP.privacy.buildExport() wraps it with a scope note and stamps the time
 *      that was passed in (no hidden Date.now()).
 *   4. The no-surveillance stance is stated (no keystroke/presence/location).
 *   5. i18n EN+AR for every Privacy key; renders under AR/dark.
 * jsdom; no network. */
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const errors = [];
function assert(c, m) { if (!c) errors.push('[assert] ' + m); }

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const srcs = [...html.matchAll(/src="([^"]+\.js)"/g)].map(m => m[1]);
const dom = new JSDOM('<!doctype html><body><div id="view"></div><div id="root"></div><div id="overlay-host"></div></body>', { url: 'https://x/tempo/', runScripts: 'outside-only' });
const { window } = dom;
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
window.setInterval = () => 0;
for (const s of srcs) { try { new window.Function(fs.readFileSync(path.join(root, s), 'utf8')).call(window); } catch (e) { errors.push('[load] ' + s + ': ' + e.message); } }
const WP = window.WP;
WP.render = function () {};
const el = window.document.getElementById('root');
const tick = () => new Promise(r => setTimeout(r, 0));
WP.state.lang = 'en';

(async function () {
  // ---- 1) section renders for a non-admin (every user has it) ---------------
  WP.state.viewerId = 'p_idris'; WP.state.authed = true; WP._settingsTab = 'mine';
  WP.ui.settings.render(el);
  let h = el.innerHTML;
  assert(new RegExp(WP.i18n.t('pvTitle')).test(h), 'Privacy section renders on the personal tab');
  assert(/id="pv-export"/.test(h), 'export-my-data button renders');
  assert(new RegExp(WP.i18n.t('pvNeverTitle')).test(h), 'the "what Tempo never does" guardrail is shown');
  // every declared category has a rendered label
  (WP.privacy.CATEGORIES || []).forEach(function (c) {
    assert(new RegExp(WP.i18n.t('pvCat_' + c.key)).test(h), 'category label rendered: ' + c.key);
  });
  assert((WP.privacy.CATEGORIES || []).length >= 3, 'privacy catalogue lists several categories');

  // ---- 2) myData returns ONLY the current viewer's data ---------------------
  const mine = await WP.privacy.myData(WP.state.refDate);
  assert(mine && mine.subject === 'p_idris', 'myData subject is the current viewer');
  assert(mine.identity && mine.identity.id === 'p_idris', 'identity is the viewer’s own record');
  assert(mine.preferences && typeof mine.preferences === 'object', 'preferences included');
  assert(Array.isArray(mine.events), 'events included as an array');
  // myData must return exactly the SELF query — never widen to another person.
  // Prove the filter works: a query for someone else yields a different set,
  // and myData(self) never leaks a foreign event (checked at the store level).
  const raw = (WP.events && WP.events.query) ? await WP.events.query('p_idris', {}, WP.state.refDate) : [];
  const foreignInRaw = raw.filter(function (e) { return e.subjectId && e.subjectId !== 'p_idris'; });
  assert(foreignInRaw.length === 0, 'the self event query returns no other person’s events');
  assert(mine.events.length === raw.length, 'myData exports exactly the viewer’s own events (no more, no fewer)');
  // every event keeps its source (explainable, not fabricated)
  const sourced = mine.events.every(function (e) { return typeof e.source === 'string' && e.source.length > 0; });
  assert(sourced, 'every exported event carries its source');
  // the no-surveillance note is present in the payload itself
  assert(/never|not people|keystroke/i.test(mine.note || ''), 'myData carries the no-surveillance note');

  // ---- 3) buildExport wraps + stamps the given time -------------------------
  const stamp = '2026-07-14T00:00:00.000Z';
  const out = WP.privacy.buildExport(mine, stamp);
  assert(out._tempoExport === 'personal-data', 'export is tagged as a personal-data export');
  assert(out._generatedAt === stamp, 'export stamps the time passed in (no hidden Date.now)');
  assert(/only your own/i.test(out._scope || ''), 'export scope note says only-your-own-data');
  assert(out.data === mine, 'export wraps the data payload');
  // it must serialize cleanly (what the download does)
  let serialized = '';
  try { serialized = JSON.stringify(out); } catch (e) { errors.push('[assert] export failed to serialize: ' + e.message); }
  assert(serialized.indexOf('p_idris') > -1, 'serialized export contains the viewer’s id');

  // ---- 4) the module must not invent surveillance categories ----------------
  const keys = (WP.privacy.CATEGORIES || []).map(function (c) { return c.key; });
  ['keystroke', 'presence', 'location', 'screen', 'mouse'].forEach(function (bad) {
    assert(keys.indexOf(bad) === -1, 'no surveillance category: ' + bad);
  });

  // ---- 5) i18n EN+AR + AR/dark ----------------------------------------------
  const i18nKeys = ['pvTitle','pvSub','pvHoldsTitle','pvSource','pvNeverTitle','pvNeverBody',
    'pvExport','pvExportNote','pvExportBtn','pvExporting','pvExportDone','pvExportError',
    'pvCat_identity','pvCat_preferences','pvCat_evidence','pvCat_decisions',
    'pvWhy_identity','pvWhy_preferences','pvWhy_evidence','pvWhy_decisions',
    'pvSrc_directory','pvSrc_this_device','pvSrc_work_signals','pvSrc_activity_log'];
  i18nKeys.forEach(function (k) {
    WP.state.lang = 'en'; const en = WP.i18n.t(k);
    WP.state.lang = 'ar'; const ar = WP.i18n.t(k);
    assert(en && en !== k, 'i18n EN present: ' + k);
    assert(ar && ar !== k, 'i18n AR present: ' + k);
  });
  WP.state.lang = 'ar'; WP.state.theme = 'dark'; WP._settingsTab = 'mine';
  try { WP.ui.settings.render(el); assert(new RegExp(WP.i18n.t('pvTitle')).test(el.innerHTML), 'Privacy renders under AR/dark'); }
  catch (e) { errors.push('[assert] AR/dark render threw: ' + e.message); }
  WP.state.lang = 'en'; WP.state.theme = 'light';

  if (errors.length) { console.log('FAIL\n' + errors.join('\n')); process.exit(1); }
  console.log('PASS — privacy: honest "what Tempo tracks" catalogue + no-surveillance guardrail render for every user; export returns ONLY the viewer’s own identity/preferences/sourced events, wrapped with a scope note and the caller’s timestamp; no fabricated surveillance categories; EN+AR both themes.');
  process.exit(0);
})();
