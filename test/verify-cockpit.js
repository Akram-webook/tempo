/* COCKPIT-ONLY pilot cut (WP.config.cockpitOnly) — reversible packaging flag for
 * the weekend Workload MVP. Asserts BOTH states:
 *   cockpitOnly=true  → sidebar shows ONLY Workload (+ Org Tree/Permissions/Settings/
 *                       Admins for managers); hidden routes redirect to the cockpit;
 *                       eval banner suppressed; the cockpit itself renders.
 *   cockpitOnly=false → the full app returns (dashboard/sales/evaluations nav + routes).
 * EN + AR. Nothing deleted — one flag reverses it. */
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const srcs = [...html.matchAll(/src="([^"]+\.js)"/g)].map(m => m[1]);
const shellBody = (html.match(/<body[^>]*>([\s\S]*?)<\/body>/) || [, ''])[1].replace(/<script[\s\S]*?<\/script>/g, '');
const dom = new JSDOM('<!doctype html><html><body>' + shellBody + '</body></html>', { url: 'https://localhost/', pretendToBeVisual: true, runScripts: 'outside-only' });
const { window } = dom;
window.HTMLElement.prototype.scrollIntoView = function () {};
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
window.setInterval = () => 0; window.confirm = () => false; window.alert = () => {}; window.prompt = () => null;
const errors = [];
const benign = /font|stylesheet|localStorage|Security|scrollIntoView|Not implemented|opaque|insertRule|cssRules/i;
['error', 'warn'].forEach(k => { const o = window.console[k].bind(window.console); window.console[k] = (...a) => { const s = a.join(' '); if (!benign.test(s)) errors.push('[' + k + '] ' + s); o(...a); }; });
window.addEventListener('error', e => { if (!benign.test(String(e.message))) errors.push('[onerror] ' + e.message); });
for (const s of srcs) { try { new window.Function(fs.readFileSync(path.join(root, s), 'utf8')).call(window); } catch (e) { errors.push('[load ' + s + '] ' + e.message); } }
const WP = window.WP;
function assert(c, m) { if (!c) errors.push('[assert] ' + m); }
const view = () => window.document.getElementById('view');
const navIds = () => [].slice.call(window.document.getElementById('topbar').querySelectorAll('[data-go]')).map(b => b.dataset.go);

try {
  // shipped default
  assert(WP.config.cockpitOnly === true, 'cockpitOnly defaults to true (the pilot ships the lean cut)');
  assert(typeof WP.cockpitHidden === 'function', 'WP.cockpitHidden() guard exists');
  const configJs = fs.readFileSync(path.join(root, 'src/js/core/config.js'), 'utf8');
  assert(/set to false to restore the full app|restore the full app/i.test(configJs), 'config documents the one-line reversal');

  // guard truth table
  ['dashboard', 'map', 'me', 'evaluations', 'daily', 'sales', 'exec', 'wellbeing', 'fairness'].forEach(function (id) {
    assert(WP.cockpitHidden(id) === true, 'cockpitOnly hides "' + id + '"');
  });
  ['workload', 'orgtree', 'permissions', 'settings', 'admins'].forEach(function (id) {
    assert(WP.cockpitHidden(id) === false, 'cockpitOnly keeps "' + id + '"');
  });

  // render as a manager/admin
  const dir = (WP.data.PEOPLE || []).find(p => WP.access.canManage(p));
  assert(dir, 'a manager/admin exists');
  WP.state.authed = true; WP.state.lang = 'en'; WP.state.viewerId = dir.id;
  WP.setState({ route: 'workload' });

  // NAV — only the cockpit surfaces
  const nav = navIds();
  assert(nav.indexOf('workload') >= 0, 'cockpitOnly: Workload is in the nav');
  ['dashboard', 'map', 'me', 'evaluations', 'daily', 'sales'].forEach(function (id) {
    assert(nav.indexOf(id) < 0, 'cockpitOnly: nav hides "' + id + '"');
  });
  assert(nav.indexOf('settings') >= 0 && nav.indexOf('orgtree') >= 0, 'cockpitOnly: Org Tree + Settings kept for managers');

  // the cockpit renders
  assert(/Workload cockpit|wl-kpis|wl-row|wl-hm-cell/.test(view().innerHTML), 'cockpitOnly: cockpit renders on home');

  // a hidden route redirects to the cockpit (defence in depth)
  WP.setState({ route: 'sales' });
  assert(/Workload cockpit|wl-kpis/.test(view().innerHTML), 'cockpitOnly: hidden route "sales" redirects to the cockpit (sales body never paints)');

  // eval banner suppressed
  WP.setState({ route: 'workload' });
  const eb = window.document.getElementById('eval-banner');
  assert(!eb || eb.hidden || eb.innerHTML === '', 'cockpitOnly: eval banner suppressed');

  // AR still cockpit-only
  WP.state.lang = 'ar'; WP.setState({ route: 'workload' });
  assert(navIds().indexOf('dashboard') < 0 && navIds().indexOf('workload') >= 0, 'cockpitOnly under AR: still only cockpit nav');
  WP.state.lang = 'en';

  // ── reversibility: full app returns ──
  WP.config.cockpitOnly = false;
  WP.setState({ route: 'workload' });
  const navF = navIds();
  assert(navF.indexOf('dashboard') >= 0 && navF.indexOf('sales') >= 0 && navF.indexOf('evaluations') >= 0, 'cockpitOnly=false: full nav returns');
  WP.setState({ route: 'sales' });
  assert(!/Workload cockpit/.test(view().innerHTML), 'cockpitOnly=false: sales route reachable again');
  WP.config.cockpitOnly = true;
} catch (e) { errors.push('[run] ' + e.message + '\n' + e.stack); }

if (errors.length) { console.log('FAIL — verify-cockpit\n' + errors.join('\n')); process.exit(1); }
console.log('PASS — cockpit-only pilot cut: one reversible flag (WP.config.cockpitOnly, default true) hides every non-cockpit surface (nav + routes redirect home + eval banner suppressed) while the Workload cockpit renders; keeps Org Tree/Permissions/Settings/Admins for managers; EN+AR; cockpitOnly=false restores the full app. Nothing deleted.');
process.exit(0);
