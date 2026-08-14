/* Organisation Tree (Event Operations) — the OrgTree spec, in tempo.
 * Loads the real bundle in jsdom, checks every derived count reconciles to
 * WP.orgTreeData.PEOPLE (headcount/positions/countries/freelance/open + squad
 * sizes), renders the board as a manager and asserts the spec surfaces (stat
 * strip, search, squad dropdown, filters button, recursive tree + bus, 29
 * cards), and gates to director/admin only. */
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
  const D = WP.orgTreeData;
  assert(!!D && D.PEOPLE.length === 32, '32 positions in the roster (got ' + (D && D.PEOPLE.length) + ')');
  assert(D.SQUADS.length === 5, '5 squads');
  const ppl = D.PEOPLE.filter(p => p.status !== 'open');
  assert(ppl.length === 32, 'headcount excludes open → 32 people (got ' + ppl.length + ')');
  assert(ppl.filter(p => p.country === 'Saudi Arabia').length === 29, '29 people in Saudi Arabia');
  assert(ppl.filter(p => p.country === 'UAE').length === 3, '3 people in UAE');
  assert(ppl.filter(p => p.contract === 'Freelance').length === 6, '6 freelancers');
  assert(D.PEOPLE.filter(p => p.status === 'open').length === 0, '0 open roles');
  assert(D.PEOPLE.filter(p => p.status === 'incoming').length === 1, '1 incoming');
  const sc = n => D.PEOPLE.filter(p => p.squad === n).length;
  assert(sc('Automation & Execution') === 4 && sc('Sports') === 11 && sc('Entertainment') === 6 && sc('On Ground') === 4 && sc('Cashless') === 5, 'squad sizes 4/11/6/4/5');
  // 2 sub-teams (Live Shows · Execution)
  assert([...new Set(D.PEOPLE.map(p => p.unit).filter(Boolean))].length === 2, 'two sub-teams');
  // manager links resolve
  D.PEOPLE.forEach(p => { if (p.manager) assert(!!D.PEOPLE.find(x => x.id === p.manager), p.id + ' manager resolves'); });

  // i18n
  assert(WP.i18n.t('navOrgTree') !== 'navOrgTree', 'navOrgTree exists');
  assert(WP.i18n.t('orgTreeSub2') !== 'orgTreeSub2', 'orgTreeSub2 exists');

  // RBAC
  assert(WP.ui.orgTree.canView({ level: 'director' }) === true, 'director can view');
  assert(WP.ui.orgTree.canView({ superAdmin: true }) === true, 'super admin can view');
  assert(WP.ui.orgTree.canView({ level: 'spec' }) === false, 'specialist cannot view');
  assert(WP.ui.orgTree.canView(null) === false, 'no viewer cannot view');

  // render as super admin
  WP.state.authed = true; WP.state.viewerId = 'p_akram'; WP.state.lang = 'en';
  const host = window.document.createElement('div');
  WP.ui.orgTree.render(host);
  const out = host.innerHTML;
  assert(/ot-tree/.test(out), 'render: tree present');
  assert(/ot-bus/.test(out), 'render: horizontal bus present');
  assert((out.match(/ot-chead/g) || []).length === 5, 'render: five squad headers');
  assert((out.match(/class="ot-card/g) || []).length === 32, 'render: 32 cards (got ' + (out.match(/class="ot-card/g) || []).length + ')');
  assert(host.querySelectorAll('[data-open]').length === 32, 'render: 32 clickable cards');
  assert(/data-q/.test(out) && /data-ddbtn/.test(out) && /data-fbtn/.test(out), 'render: search + squad dropdown + filters controls');
  assert(/ot-pinmark/.test(out), 'render: CSS map pins in the stat strip');
  assert(/ot-kids/.test(out), 'render: recursive nesting present');
  assert(/ot-tag you/.test(out) && out.indexOf('Mohammed Akram') >= 0, 'render: viewer YOU badge');

  // denied render for a non-manager
  const origViewer = WP.viewer;
  WP.viewer = () => ({ id: 'x', level: 'spec' });
  const deny = window.document.createElement('div');
  WP.ui.orgTree.render(deny);
  WP.viewer = origViewer;
  assert(!/ot-tree/.test(deny.innerHTML), 'non-manager: no tree');
  assert(deny.innerHTML.indexOf(WP.i18n.t('orgTreeDenied')) >= 0, 'non-manager: gate message');
} catch (e) {
  errors.push('[throw] ' + e.message + '\n' + e.stack);
}

if (errors.length) {
  console.error('FAIL — verify-orgtree\n' + errors.join('\n'));
  process.exit(1);
}
console.log('PASS — organisation tree: derived counts reconcile (32 people · 29 SA / 3 UAE · 6 freelance · 0 open · squads 4/11/6/4/5 · 2 sub-teams), renders stat strip + pins + search + squad dropdown + filters + recursive tree + bus (32 cards) with the viewer YOU badge, and gates to director/admin only.');
