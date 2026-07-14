/* Settings/layout/tier/activity regression (wave/layout-settings-tiers).
 * Proves this wave's UX changes render and stay gated:
 *   1. Activity log is its own page, gated to viewSettings (director/admin), read-only.
 *   2. Tier editor shows the ROUTINE baseline tag + a live per-tier event count.
 *   3. Settings Slack list is alphabetical + exposes an editable Slack ID field, and
 *      flags how many people still have no Slack ID (Hamdi + others).
 *   4. i18n: every new key present in EN and AR. */
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
const root_el = window.document.getElementById('root');
WP.state.lang = 'en';

// helper: become a viewer
function be(id) { WP.state.viewerId = id; WP.state.authed = true; }

// ---- 1) Activity page = SUPER ADMIN ONLY + read-only ---------------------
// Akram: the override log must NOT show to directors/other admins — only the
// Super Admin (manageAdmins cap). A specialist AND a director are both redirected.
assert(WP.ui.activity && typeof WP.ui.activity.render === 'function', 'WP.ui.activity.render exists');
function assertRedirected(id, label) {
  be(id);
  let redirected = false; const realSet = WP.setState;
  WP.setState = function (patch) { if (patch && patch.route === 'map') redirected = true; };
  WP.ui.activity.render(root_el);
  WP.setState = realSet;
  assert(redirected, label + ' is redirected away from the activity page (Super-Admin-only gate)');
}
assertRedirected('p_idris', 'specialist');
assertRedirected('p_ahmed', 'director (NOT super admin)');

be('p_akram'); // super admin (manageAdmins)
WP.ui.activity._reset();
WP.activityLog.unshift({ type: 'config', by: 'p_akram', target: 'tier 3 = 12%', at: '2026-07-12T10:00:00' });
WP.ui.activity.render(root_el);
const html1 = root_el.innerHTML;
assert(/log-table|log-empty/.test(html1), 'activity page renders a table (or empty state)');
assert(!/<input|<button[^>]*data-/.test(html1.replace(/id="back"|id="log-more"/g, '')), 'activity page is read-only (no data-editing inputs)');

// ---- 2) Workspace tab is now Members & Access ONLY -----------------------
// Trimmed (Akram review): tier weights, capacity-state reference, roles wall,
// activity-log button and Slack linking were removed. Only the member roster
// with grant/revoke remains.
WP._settingsTab = 'workspace';
WP.ui.settings.render(root_el);
const shtml = root_el.innerHTML;
assert(/mbr-list/.test(shtml), 'Workspace shows the Members & Access roster');
assert(!/tier-routine|tier-count|data-tier=/.test(shtml), 'tier editor is REMOVED from Workspace');
assert(!/data-slack=|slack-edit/.test(shtml), 'Slack linking is REMOVED from Workspace');
assert(!/role-card|accessModel/.test(shtml), 'the roles reference wall is REMOVED');
assert(!/id="go-activity"/.test(shtml), 'the activity-log button is REMOVED from Workspace');

// ---- 3) The activity page itself still exists as its own gated route ------
// (only the shortcut button in Settings was removed; the page is unchanged)
assert(WP.ui.activity && typeof WP.ui.activity.render === 'function', 'activity page route still exists');

// ---- 4) i18n coverage (Members & Access strings that remain) --------------
const keys = ['membersTitle','membersCount','membersNote','membersSearch','membersInvite',
  'accessOn','accessOff','activitySub','logEntries','logColAction'];
keys.forEach(function (k) {
  WP.state.lang = 'en'; const en = WP.i18n.t(k);
  WP.state.lang = 'ar'; const ar = WP.i18n.t(k);
  assert(en && en !== k, 'i18n EN present: ' + k);
  assert(ar && ar !== k, 'i18n AR present: ' + k);
});
WP.state.lang = 'en';

if (errors.length) { console.log('FAIL\n' + errors.join('\n')); process.exit(1); }
console.log('PASS — layout/settings: activity is its own gated read-only page; Workspace tab is now Members & Access ONLY (tiers, states, roles wall, activity button and Slack linking removed); EN+AR i18n complete.');
process.exit(0);
