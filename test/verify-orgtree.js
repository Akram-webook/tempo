/* Organisation Tree — the Event Operations org chart page. Loads the real
 * bundle in jsdom, renders the view in EN + AR, and asserts the full roster,
 * squad structure, open roles, incoming flag, the viewer "You" badge, the
 * signed-in gate, and search wiring. Mirrors the other verify-*.js harnesses. */
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const srcs = [...html.matchAll(/src="([^"]+\.js)"/g)].map(m => m[1]);
const shellBody = (html.match(/<body[^>]*>([\s\S]*?)<\/body>/) || [, ''])[1].replace(/<script[\s\S]*?<\/script>/g, '');
const dom = new JSDOM('<!doctype html><html><body>' + shellBody + '</body></html>', { url: 'https://akram-webook.github.io/tempo/', runScripts: 'outside-only' });
const { window } = dom;
window.HTMLElement.prototype.scrollIntoView = function () {};
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
window.setInterval = () => 0;
const errors = [];
const benign = /font|stylesheet|localStorage|Security|scrollIntoView|Not implemented|opaque|insertRule|cssRules|gsi|accounts\.google|cdn\.jsdelivr|supabase/i;
['error', 'warn'].forEach(k => { const o = window.console[k].bind(window.console); window.console[k] = (...a) => { const s = a.join(' '); if (!benign.test(s)) errors.push('[' + k + '] ' + s); o(...a); }; });
window.addEventListener('error', e => { if (!benign.test(String(e.message))) errors.push('[onerror] ' + e.message); });
for (const s of srcs) { try { new window.Function(fs.readFileSync(path.join(root, s), 'utf8')).call(window); } catch (e) { errors.push('[load ' + s + '] ' + e.message); } }
const WP = window.WP;
function assert(c, m) { if (!c) errors.push('[assert] ' + m); }

try {
  assert(!!(WP.ui && WP.ui.orgTree), 'WP.ui.orgTree exists');
  const O = WP.ui.orgTree._org;
  assert(O.exec.length === 2, 'exec spine has 2 (CCO + Director)');
  assert(O.teams.length === 5, 'five squads');

  // Independent roster tally from the data.
  let filled = O.exec.length, open = 0, incoming = 0, names = [];
  O.exec.forEach(p => names.push(p.name));
  O.teams.forEach(t => {
    const all = [t.lead, ...t.reports].concat(t.sub ? [t.sub.lead, ...t.sub.reports] : []);
    all.forEach(p => { if (p.open) open++; else filled++; if (p.neu) incoming++; names.push(p.name); });
  });
  assert(filled === 26, '26 filled roles (got ' + filled + ')');
  assert(open === 3, '3 open TBC roles (got ' + open + ')');
  assert(incoming === 1, 'exactly one incoming member');
  ['Hamdi Missaoui', 'Ahmed Othman', 'Motaa Aldarra', 'Ayah Nasif', 'Omar Zarea', 'Mohammed Akram', 'Batool Emad']
    .forEach(n => assert(names.indexOf(n) >= 0, 'roster includes ' + n));

  // i18n present (EN) + AR.
  assert(WP.i18n.t('navOrgTree') !== 'navOrgTree', 'navOrgTree string exists');
  assert(WP.i18n.t('orgTreeTitle') !== 'orgTreeTitle', 'orgTreeTitle string exists');

  // Render (signed in) — EN.
  WP.state.authed = true; WP.state.viewerId = 'p_akram'; WP.state.lang = 'en';
  const host = window.document.createElement('div');
  WP.ui.orgTree.render(host);
  let out = host.innerHTML;
  assert(/otc-board/.test(out), 'render: board present');
  assert(/otc-head/.test(out), 'render: squad headers present');
  assert(out.indexOf('Anti-Fraud') >= 0, 'render: Anti-Fraud sub-unit present');
  assert((out.match(/otc-card/g) || []).length === 29, 'render: 29 cards (26 people + 3 TBC) — got ' + (out.match(/otc-card/g) || []).length);
  assert((out.match(/is-open/g) || []).length === 3, 'render: 3 open-role cards');
  assert(/otc-you/.test(out) && out.indexOf('Mohammed Akram') >= 0, 'render: viewer "You" badge on the viewer card');
  assert(out.indexOf(WP.i18n.t('orgTreeTitle')) >= 0, 'render: EN title present');
  assert(/data-otc-search/.test(out), 'render: search control present');

  // AR render (RTL).
  WP.state.lang = 'ar';
  WP.ui.orgTree.render(host);
  assert(host.innerHTML.indexOf('الهيكل التنظيمي') >= 0, 'render: AR title present');
  WP.state.lang = 'en';

  // RBAC: real personal data → director/admin only, not every employee.
  assert(WP.ui.orgTree.canView({ level: 'director' }) === true, 'director can view');
  assert(WP.ui.orgTree.canView({ superAdmin: true }) === true, 'super admin can view');
  assert(WP.ui.orgTree.canView({ level: 'spec' }) === false, 'specialist cannot view');
  assert(WP.ui.orgTree.canView(null) === false, 'no viewer cannot view');

  // Denied render for a non-manager — no board, just the gate message.
  const origViewer = WP.viewer;
  WP.viewer = () => ({ id: 'x', level: 'spec' });
  const denyHost = window.document.createElement('div');
  WP.ui.orgTree.render(denyHost);
  WP.viewer = origViewer;
  assert(!/otc-board/.test(denyHost.innerHTML), 'non-manager: no board rendered');
  assert(denyHost.innerHTML.indexOf(WP.i18n.t('orgTreeDenied')) >= 0, 'non-manager: gate message shown');
} catch (e) {
  errors.push('[throw] ' + e.message + '\n' + e.stack);
}

if (errors.length) {
  console.error('FAIL — verify-orgtree\n' + errors.join('\n'));
  process.exit(1);
}
console.log('PASS — organisation tree: roster reconciles (26 people + 3 TBC across 5 squads + Anti-Fraud + exec spine), renders the board/headers/sub-unit with the viewer "You" badge in EN + AR, and gates to director+admin only.');
