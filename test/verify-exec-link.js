/* Executive-status entry point (wave/exec-deck-link). Proves:
 *   1. When WP.config.execDeckUrl is set AND the viewer is director/admin,
 *      BOTH entry points render: the dashboard card and the account-menu item,
 *      and both point at the deck URL.
 *   2. Both open in a NEW TAB (target="_blank" rel="noopener noreferrer") —
 *      the deck is never embedded (it is a Google-auth link).
 *   3. Role gate: a member/specialist (no viewSettings) sees NEITHER.
 *   4. Off state: execDeckUrl empty → NOTHING renders, even for an admin.
 *   5. i18n EN+AR for execStatus/execStatusSub; renders under AR/dark.
 * jsdom; no network. */
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const errors = [];
function assert(c, m) { if (!c) errors.push('[assert] ' + m); }

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const srcs = [...html.matchAll(/src="([^"]+\.js)"/g)].map(m => m[1]);
// full shell DOM so the real topbar() (app.js) can render the account menu.
const dom = new JSDOM(
  '<!doctype html><body>' +
  '<div id="appbar"></div><div id="topbar"></div><div id="nav-backdrop"></div>' +
  '<div id="view"></div><div id="root"></div><div id="eval-banner"></div>' +
  '<div id="overlay-host"></div><div id="signature-bar"></div>' +
  '</body>',
  { url: 'https://x/tempo/', runScripts: 'outside-only' });
const { window } = dom;
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
window.setInterval = () => 0;
window.scrollTo = () => {};
for (const s of srcs) { try { new window.Function(fs.readFileSync(path.join(root, s), 'utf8')).call(window); } catch (e) { errors.push('[load] ' + s + ': ' + e.message); } }
const WP = window.WP;
const dashEl = window.document.getElementById('root');
WP.state.lang = 'en';

const DECK = 'https://docs.google.com/presentation/d/EXEC_DECK/edit';

function be(id) { WP.state.viewerId = id; WP.state.authed = true; WP.state.route = 'dashboard'; }
function card() { WP.ui.dashboard.render(dashEl); return dashEl.innerHTML; }
function navItem() {
  // drive the real app.js render so the account menu is built by topbar().
  WP.render();
  const el = window.document.getElementById('acct-execstatus');
  return el;
}

// ---- 1 + 2) admin, URL set → both entry points render + open in a new tab ----
WP.config.execDeckUrl = DECK;
be('p_akram'); // super admin (viewSettings)
assert(WP.execDeckVisible() === true, 'execDeckVisible true for admin with URL set');

const cAdmin = card();
assert(/exec-card/.test(cAdmin), 'dashboard card renders for admin');
assert(cAdmin.indexOf(DECK) > -1, 'dashboard card points at the deck URL');
const cardTag = (cAdmin.match(/<a class="exec-card"[^>]*>/) || [''])[0];
assert(/target="_blank"/.test(cardTag), 'dashboard card opens in a new tab');
assert(/rel="noopener noreferrer"/.test(cardTag), 'dashboard card is rel=noopener noreferrer');

const nav = navItem();
assert(nav, 'account-menu item renders for admin');
assert(nav && nav.getAttribute('href') === DECK, 'nav item points at the deck URL');
assert(nav && nav.getAttribute('target') === '_blank', 'nav item opens in a new tab');
assert(nav && nav.getAttribute('rel') === 'noopener noreferrer', 'nav item is rel=noopener noreferrer');

// ---- 3) role gate: a specialist (no viewSettings) sees NEITHER ---------------
be('p_idris'); // specialist
assert(WP.execDeckVisible() === false, 'execDeckVisible false for a non-admin/director');
assert(!/exec-card/.test(card()), 'specialist does NOT see the dashboard card');
assert(!navItem(), 'specialist does NOT see the account-menu item');

// ---- 4) off state: URL empty → NOTHING renders, even for an admin ------------
WP.config.execDeckUrl = '';
be('p_akram');
assert(WP.execDeckVisible() === false, 'execDeckVisible false when URL empty');
assert(!/exec-card/.test(card()), 'no dashboard card when the deck URL is empty (even for admin)');
assert(!navItem(), 'no account-menu item when the deck URL is empty (even for admin)');
// whitespace-only is treated as empty too
WP.config.execDeckUrl = '   ';
assert(WP.execDeckVisible() === false, 'whitespace-only URL is treated as empty');
WP.config.execDeckUrl = DECK;

// ---- 5) i18n EN+AR + AR/dark render -----------------------------------------
['execStatus', 'execStatusSub'].forEach(function (k) {
  WP.state.lang = 'en'; const en = WP.i18n.t(k);
  WP.state.lang = 'ar'; const ar = WP.i18n.t(k);
  assert(en && en !== k, 'i18n EN present: ' + k);
  assert(ar && ar !== k, 'i18n AR present: ' + k);
});
WP.state.lang = 'ar'; WP.state.theme = 'dark';
be('p_akram');
try { assert(/exec-card/.test(card()), 'exec card renders under AR/dark'); }
catch (e) { errors.push('[assert] AR/dark render threw: ' + e.message); }
WP.state.lang = 'en'; WP.state.theme = 'light';

if (errors.length) { console.log('FAIL\n' + errors.join('\n')); process.exit(1); }
console.log('PASS — exec-link: dashboard card + account-menu item render for director/admin when the deck URL is set, both open the deck in a new tab (noopener); hidden for members and when the URL is empty; EN+AR both themes.');
process.exit(0);
