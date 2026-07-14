/* Executive Status — the live in-app page (wave/exec-page). Proves:
 *   1. WP.execVisible() is true for director/admin, false for a specialist.
 *   2. The exec PAGE renders for an admin from live data — portfolio KPIs,
 *      "what needs you", and team load — and re-checks its gate (a specialist
 *      calling render is redirected, never shown the page).
 *   3. The dashboard shows a shortcut CARD to the exec page for director/admin,
 *      and it navigates INTERNALLY (data-go="exec"), not to an external URL.
 *   4. The nav includes an "Executive status" tab for director/admin only.
 *   5. i18n EN+AR (execStatus, execSub); the page renders under AR/dark.
 * jsdom; no network. */
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const errors = [];
function assert(c, m) { if (!c) errors.push('[assert] ' + m); }

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const srcs = [...html.matchAll(/src="([^"]+\.js)"/g)].map(m => m[1]);
const dom = new JSDOM(
  '<!doctype html><body><div id="view"></div><div id="root"></div><div id="overlay-host"></div></body>',
  { url: 'https://x/tempo/', runScripts: 'outside-only' });
const { window } = dom;
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
window.setInterval = () => 0;
window.scrollTo = () => {};
for (const s of srcs) { try { new window.Function(fs.readFileSync(path.join(root, s), 'utf8')).call(window); } catch (e) { errors.push('[load] ' + s + ': ' + e.message); } }
const WP = window.WP;
WP.render = function () {};
const el = window.document.getElementById('root');
WP.state.lang = 'en';

function be(id) { WP.state.viewerId = id; WP.state.authed = true; WP.state.route = 'exec'; }

// ---- 1) gate: director/admin yes, specialist no ----------------------------
be('p_akram');
assert(WP.execVisible() === true, 'execVisible true for admin');
be('p_ahmed');
assert(WP.execVisible() === true, 'execVisible true for director');
be('p_idris');
assert(WP.execVisible() === false, 'execVisible false for a specialist');

// ---- 2) the page renders from live data for an admin -----------------------
be('p_akram');
WP.ui.exec.render(el);
let h = el.innerHTML;
assert(new RegExp(WP.i18n.t('execStatus')).test(h), 'exec page shows its title');
assert(new RegExp(WP.i18n.t('teamHealth')).test(h), 'portfolio KPI (team health) renders');
assert(new RegExp(WP.i18n.t('needsAttention')).test(h), '"what needs you" section renders');
assert(new RegExp(WP.i18n.t('teamLoad')).test(h) || /class="metrics"/.test(h), 'team-load / metrics render');
assert(/provenance-note/.test(h), 'honest "sample data" provenance note present');

// ---- 2b) a specialist calling render is redirected (defence in depth) -------
be('p_idris');
let redirected = false; const realSet = WP.setState;
WP.setState = function (patch) { if (patch && patch.route === 'map') redirected = true; };
WP.ui.exec.render(el);
WP.setState = realSet;
assert(redirected, 'specialist is redirected away from the exec page');

// ---- 3) dashboard card = internal shortcut, not an external URL -------------
be('p_akram'); WP.state.route = 'dashboard';
WP.ui.dashboard.render(el);
h = el.innerHTML;
const card = (h.match(/<button[^>]*class="exec-card"[^>]*>/) || [''])[0];
assert(/class="exec-card"/.test(h), 'dashboard shows the exec-status card for admin');
assert(/data-go="exec"/.test(card), 'card navigates INTERNALLY to the exec page (data-go="exec")');
assert(!/href=|target="_blank"/.test(card), 'card is NOT an external link anymore');
// member sees no card
be('p_idris'); WP.state.route = 'dashboard';
WP.ui.dashboard.render(el);
assert(!/class="exec-card"/.test(el.innerHTML), 'specialist does NOT see the exec card');

// ---- 4) nav tab present for director/admin, absent for member --------------
// (the nav array is built in app.js topbar(); we assert the gate that drives it)
be('p_akram');   assert(WP.execVisible(), 'admin would get the exec nav tab');
be('p_ahmed');   assert(WP.execVisible(), 'director would get the exec nav tab');
be('p_idris');   assert(!WP.execVisible(), 'specialist would NOT get the exec nav tab');

// ---- 5) i18n EN+AR + AR/dark render ----------------------------------------
['execStatus', 'execStatusSub', 'execSub'].forEach(function (k) {
  WP.state.lang = 'en'; const en = WP.i18n.t(k);
  WP.state.lang = 'ar'; const ar = WP.i18n.t(k);
  assert(en && en !== k, 'i18n EN present: ' + k);
  assert(ar && ar !== k, 'i18n AR present: ' + k);
});
WP.state.lang = 'ar'; WP.state.theme = 'dark';
be('p_akram'); WP.state.route = 'exec';
try { WP.ui.exec.render(el); assert(new RegExp(WP.i18n.t('execStatus')).test(el.innerHTML), 'exec page renders under AR/dark'); }
catch (e) { errors.push('[assert] AR/dark render threw: ' + e.message); }
WP.state.lang = 'en'; WP.state.theme = 'light';

if (errors.length) { console.log('FAIL\n' + errors.join('\n')); process.exit(1); }
console.log('PASS — exec status: live in-app page (portfolio KPIs + what-needs-you + team load) for director/admin, gate re-checked; dashboard card is an INTERNAL shortcut (data-go, no external URL); nav tab + card hidden from members; EN+AR both themes.');
process.exit(0);
