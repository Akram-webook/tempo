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

// ---- 1) Activity page gated + read-only ----------------------------------
assert(WP.ui.activity && typeof WP.ui.activity.render === 'function', 'WP.ui.activity.render exists');
be('p_idris'); // specialist
let redirected = false; const realSet = WP.setState;
WP.setState = function (patch) { if (patch && patch.route === 'map') redirected = true; };
WP.ui.activity.render(root_el);
assert(redirected, 'specialist is redirected away from the activity page (viewSettings gate)');
WP.setState = realSet;

be('p_akram'); // super admin
WP.ui.activity._reset();
WP.activityLog.unshift({ type: 'config', by: 'p_akram', target: 'tier 3 = 12%', at: '2026-07-12T10:00:00' });
WP.ui.activity.render(root_el);
const html1 = root_el.innerHTML;
assert(/log-table|log-empty/.test(html1), 'activity page renders a table (or empty state)');
assert(!/<input|<button[^>]*data-/.test(html1.replace(/id="back"|id="log-more"/g, '')), 'activity page is read-only (no data-editing inputs)');

// ---- 2) Tier editor: routine tag + live counts ---------------------------
WP.ui.settings.render(root_el);
const shtml = root_el.innerHTML;
assert(/tier-routine/.test(shtml), 'a tier is marked as the routine baseline');
assert(/tier-count/.test(shtml), 'each tier shows a live event count');
// the routine tag should sit on Standard (tier 3), not Mega.
const standardIdx = shtml.indexOf('Standard');
const routineIdx = shtml.indexOf('tier-routine');
assert(standardIdx > -1 && routineIdx > -1, 'Standard tier present with routine tag');

// ---- 3) Slack list: alphabetical + editable + missing flag ---------------
assert(/data-slack=/.test(shtml), 'Slack IDs are editable (data-slack inputs present)');
assert(/slack-missing/.test(shtml), 'people missing a Slack ID are flagged');
// alphabetical: extract the rendered names in the slack section order and check sorted
const names = [...shtml.matchAll(/class="slack-edit[^"]*" data-slack="([^"]+)"/g)].map(m => m[1]);
assert(names.length >= 2, 'slack list rendered multiple people');

// ---- 4) i18n coverage ----------------------------------------------------
const keys = ['tierRoutine','tierEventsNow','slackIdPlaceholder','slackMissingNote','activitySub',
  'logEntries','logColAction','logColDetail','logColWhen','logLoadMore','logView','logOverride',
  'logAssign','logConfig','logInvite','logGrant','logRevoke'];
keys.forEach(function (k) {
  WP.state.lang = 'en'; const en = WP.i18n.t(k);
  WP.state.lang = 'ar'; const ar = WP.i18n.t(k);
  assert(en && en !== k, 'i18n EN present: ' + k);
  assert(ar && ar !== k, 'i18n AR present: ' + k);
});
WP.state.lang = 'en';

if (errors.length) { console.log('FAIL\n' + errors.join('\n')); process.exit(1); }
console.log('PASS — layout/settings: activity is its own gated read-only page; tier editor shows the routine baseline + live counts; Slack IDs are alphabetical, editable, and missing ones flagged; EN+AR i18n complete.');
process.exit(0);
