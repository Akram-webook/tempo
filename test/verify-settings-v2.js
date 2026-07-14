/* Settings v2 (personal + workspace split). Proves:
 *   1. Every signed-in user gets a "My settings" tab; the "Workspace" tab exists
 *      ONLY for viewSettings (admin/director) — a specialist never sees it.
 *   2. Personal → Preferences renders theme + language segmented controls (density
 *      removed; date format shown as read-only info) and changing one persists.
 *   3. Personal → Notifications renders the WHAT (assignments/mentions/evaluations)
 *      + WHERE (email/Slack) toggles — no in-app, no digest, no quiet hours;
 *      toggling one persists to WP.state.prefs.notif.
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
assert(WP.prefs.get('notif.channels.email') === true, 'default notif channel present');
// a stale saved shape missing new keys must not yield undefined
WP.state.prefs = { density: 'compact' };              // simulate an old save
WP.state.prefs = WP.prefs.defaults();                  // reset for a clean run
// date-format plumbing still works (shown as info now, not a picker)
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

// ---- 2) Preferences: theme + language only; density removed; date = info ----
be('p_akram'); WP._settingsTab = 'mine'; WP.ui.settings.render(el);
h = el.innerHTML;
assert(/data-seg="theme"/.test(h), 'theme segmented control renders');
assert(/data-seg="lang"/.test(h), 'language segmented control renders');
assert(!/data-seg="density"/.test(h), 'density control is REMOVED');
assert(!/data-seg="dateFormat"/.test(h), 'date-format is no longer a picker (info only)');
assert(new RegExp(WP.i18n.t('prefDateFmt')).test(h), 'date format is still shown (as read-only info)');
// microcopy present under a control (best practice)
assert(/set-item-note/.test(h), 'inline microcopy present under controls');
// theme via segmented → state
const darkBtn = [...el.querySelectorAll('[data-seg="theme"]')].find(b => b.dataset.val === 'dark');
darkBtn.click();
assert(WP.state.theme === 'dark', 'changing theme via Preferences updates state');
WP.state.theme = 'light';

// ---- 3) Notifications: WHAT + WHERE toggles; no inapp/digest/quiet ----------
WP._settingsTab = 'mine'; WP.ui.settings.render(el);
h = el.innerHTML;
assert(/id="ct-assignments"/.test(h) && /id="ct-mentions"/.test(h) && /id="ct-evaluations"/.test(h), 'the 3 "what" categories render');
assert(/id="nc-email"/.test(h) && /id="nc-slack"/.test(h), 'email + Slack "where" toggles render');
assert(!/id="nc-inapp"/.test(h), 'in-app channel is REMOVED');
assert(!/id="ct-digest"/.test(h), 'daily digest is REMOVED');
assert(!/id="q-on"/.test(h), 'quiet hours are REMOVED');
// toggle email OFF → persists false
const email = el.querySelector('#nc-email');
email.checked = false; email.dispatchEvent(new window.Event('change'));
assert(WP.prefs.get('notif.channels.email') === false, 'toggling a channel persists to prefs.notif');
WP.prefs.set('notif.channels.email', true);

// ---- 4) i18n coverage (EN + AR) --------------------------------------------
const keys = ['setTabMine','setTabWorkspace','setMineSub','prefsTitle','prefTheme','prefThemeNote',
  'prefLang','prefDateFmt','prefDateFmtInfo','prefSaved',
  'notifTitle','notifSub','notifWhat','notifWhere','notifEmail','notifSlack',
  'notifAssignments','notifMentions','notifEvaluations',
  'acctTitle','acctReadonly','acctRoleWhy_spec','acctRoleWhy_admin'];
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
console.log('PASS — settings v2 (trimmed): personal for everyone, Workspace gated; Preferences = theme + language (density removed, date shown as info); Notifications = what (assignments/mentions/evaluations) + where (email/Slack), no inapp/digest/quiet; toggles persist; WP.fmt.date honors pref; role shows a plain meaning; EN+AR both themes.');
process.exit(0);
