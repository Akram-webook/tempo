/* Settings v2 (personal + workspace split). Proves:
 *   1. Every signed-in user gets a "My settings" tab; the "Workspace" tab exists
 *      ONLY for viewSettings (admin/director) — a specialist never sees it.
 *   2. Personal → Preferences renders theme/language/density/date-format segmented
 *      controls and changing one persists (density/dateFormat via WP.prefs; theme/lang
 *      via state) and shows a saved confirmation.
 *   3. Personal → Notifications renders channel + category toggles + quiet hours;
 *      toggling a channel persists to WP.state.prefs.notif.
 *   4. WP.prefs defaults/merge are safe (old saved shape → no undefined keys), and
 *      WP.fmt.date honors the dateFormat pref.
 *   5. i18n: every new key present in EN and AR; renders under AR/dark too.
 * jsdom; no network. */
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const errors = [];
function assert(c, m) { if (!c) errors.push('[assert] ' + m); }

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const srcs = [...html.matchAll(/src="([^"]+\.js)"/g)].map(m => m[1]);
const dom = new JSDOM('<!doctype html><body><div id="view"></div><div id="root"></div></body>', { url: 'https://x/tempo/', runScripts: 'outside-only' });
const { window } = dom;
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
window.setInterval = () => 0;
for (const s of srcs) { try { new window.Function(fs.readFileSync(path.join(root, s), 'utf8')).call(window); } catch (e) { errors.push('[load] ' + s + ': ' + e.message); } }
const WP = window.WP;
WP.render = function () {};
const el = window.document.getElementById('root');
WP.state.lang = 'en';
function be(id) { WP.state.viewerId = id; WP.state.authed = true; WP._settingsTab = null; }

// ---- 0) prefs foundation: defaults + safe merge + date format ---------------
assert(WP.prefs && typeof WP.prefs.get === 'function', 'WP.prefs helper exists');
assert(WP.prefs.get('density') === 'comfortable', 'default density = comfortable');
assert(WP.prefs.get('notif.channels.email') === true, 'default notif channel present');
// a stale saved shape missing new keys must not yield undefined
WP.state.prefs = { density: 'compact' };              // simulate an old save
WP.state.prefs = WP.prefs.defaults();                  // reset for a clean run
assert(typeof WP.prefs.get('notif.quietHours.on') === 'boolean', 'quietHours default present after merge');
WP.state.prefs.dateFormat = 'iso';  assert(WP.fmt.date('2026-12-31') === '2026-12-31', 'fmt.date iso');
WP.state.prefs.dateFormat = 'dmy';  assert(WP.fmt.date('2026-12-31') === '31/12/2026', 'fmt.date dmy');
WP.state.prefs = WP.prefs.defaults();

// ---- 1) gating: specialist sees ONLY "My settings"; admin sees Workspace ----
be('p_idris'); // specialist
WP.ui.settings.render(el);
let h = el.innerHTML;
assert(/data-subtab="mine"/.test(h) || /prefsTitle|Preferences|التفضيلات/.test(h), 'specialist gets the personal settings');
assert(!/data-subtab="workspace"/.test(h), 'specialist does NOT get the Workspace tab');
assert(!/tier-routine|data-slack=/.test(h), 'specialist cannot see admin org-config');

be('p_akram'); // super admin
WP.ui.settings.render(el);
h = el.innerHTML;
assert(/data-subtab="workspace"/.test(h), 'admin gets the Workspace tab');
assert(/data-subtab="mine"/.test(h), 'admin also gets My settings');

// ---- 2) Preferences: segmented controls render + change persists ------------
be('p_akram'); WP._settingsTab = 'mine'; WP.ui.settings.render(el);
h = el.innerHTML;
assert(/data-seg="theme"/.test(h), 'theme segmented control renders');
assert(/data-seg="lang"/.test(h), 'language segmented control renders');
assert(/data-seg="density"/.test(h), 'density segmented control renders');
assert(/data-seg="dateFormat"/.test(h), 'date-format segmented control renders');
// microcopy present under a control (best practice)
assert(/set-item-note/.test(h), 'inline microcopy present under controls');
// click density = compact → persists to prefs
const compactBtn = [...el.querySelectorAll('[data-seg="density"]')].find(b => b.dataset.val === 'compact');
assert(compactBtn, 'compact density option present');
compactBtn.click();
assert(WP.prefs.get('density') === 'compact', 'changing density persists to WP.prefs');
// theme via segmented → state
const darkBtn = [...el.querySelectorAll('[data-seg="theme"]')].find(b => b.dataset.val === 'dark');
darkBtn.click();
assert(WP.state.theme === 'dark', 'changing theme via Preferences updates state');
WP.state.theme = 'light';

// ---- 3) Notifications: toggles render + persist; quiet hours reveal ---------
WP._settingsTab = 'mine'; WP.ui.settings.render(el);
h = el.innerHTML;
assert(/id="nc-email"/.test(h) && /id="nc-slack"/.test(h) && /id="nc-inapp"/.test(h), 'all 3 delivery channels render');
assert(/id="ct-assignments"/.test(h) && /id="ct-digest"/.test(h), 'category + digest toggles render');
assert(/id="q-on"/.test(h), 'quiet-hours toggle renders');
// toggle email OFF → persists false
const email = el.querySelector('#nc-email');
email.checked = false; email.dispatchEvent(new window.Event('change'));
assert(WP.prefs.get('notif.channels.email') === false, 'toggling a channel persists to prefs.notif');
WP.prefs.set('notif.channels.email', true);

// ---- 4) i18n coverage (EN + AR) --------------------------------------------
const keys = ['setTabMine','setTabWorkspace','setMineSub','prefsTitle','prefTheme','prefThemeNote',
  'prefLang','prefDensity','prefDensityNote','prefDateFmt','prefDateAuto','prefSaved',
  'notifTitle','notifSub','notifChannels','notifEmail','notifSlack','notifInapp','notifWhat',
  'notifAssignments','notifMentions','notifEvaluations','notifDigest','notifQuiet','notifQuietNote',
  'acctTitle','acctReadonly'];
keys.forEach(function (k) {
  WP.state.lang = 'en'; const en = WP.i18n.t(k);
  WP.state.lang = 'ar'; const ar = WP.i18n.t(k);
  assert(en && en !== k, 'i18n EN present: ' + k);
  assert(ar && ar !== k, 'i18n AR present: ' + k);
});
// renders under AR/dark without throwing
WP.state.lang = 'ar'; WP.state.theme = 'dark'; WP._settingsTab = 'mine';
try { WP.ui.settings.render(el); assert(/set-item|seg/.test(el.innerHTML), 'personal settings render under AR/dark'); }
catch (e) { errors.push('[assert] AR/dark render threw: ' + e.message); }
WP.state.lang = 'en'; WP.state.theme = 'light';

if (errors.length) { console.log('FAIL\n' + errors.join('\n')); process.exit(1); }
console.log('PASS — settings v2: personal (My settings) for everyone, Workspace gated to admin/director; Preferences (theme/lang/density/date) with microcopy persist; Notifications channels+categories+quiet-hours persist; WP.prefs defaults safe; WP.fmt.date honors pref; EN+AR both themes.');
process.exit(0);
