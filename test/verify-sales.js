/* Events Sales — engine aggregations, range scoping, RBAC gate, and the view render.
 * Cross-checks the pure WP.sales engine against an INDEPENDENT recomputation of
 * WP.salesData (so a bug in the engine can't hide behind itself), then renders the
 * director view in EN + AR. jsdom harness mirrors the other verify-*.js files. */
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
  const D = WP.salesData;
  assert(!!D && D.MONTHS.length === 12, 'dataset has 12 months');
  assert(D.ORGS.length === 8, 'dataset has 8 client orgs');
  assert(D.RECORDS.length === D.ORGS.length * D.MONTHS.length, 'one record per org per month');
  assert(D.FRAUD.length === 12, 'fraud has a row per month');

  // Independent recompute of the ALL-range totals straight from the dataset.
  let ev = 0, cash = 0, ground = 0, sportsRev = 0, entRev = 0;
  const catOf = id => (D.ORGS.filter(o => o.id === id)[0] || {}).category;
  D.RECORDS.forEach(r => {
    const rev = r.cashless + r.onGround;
    ev += r.events; cash += r.cashless; ground += r.onGround;
    if (catOf(r.orgId) === 'sports') sportsRev += rev; else entRev += rev;
  });
  const totalRev = cash + ground;

  const tot = WP.sales.totals();   // no range = all 12 months
  assert(tot.events === ev, 'totals.events matches independent sum (' + tot.events + ' vs ' + ev + ')');
  assert(tot.cashless === cash, 'totals.cashless matches');
  assert(tot.onGround === ground, 'totals.onGround matches');
  assert(tot.revenue === totalRev, 'totals.revenue === cashless + onGround');
  assert(tot.cashlessPct + tot.onGroundPct === 100, 'cashless% + onGround% === 100');
  assert(tot.orgs === 8, 'all 8 clients active across the year');

  // Category split reconciles to the whole.
  const cat = WP.sales.byCategory();
  assert(cat.sports.revenue === sportsRev, 'sports revenue matches independent sum');
  assert(cat.entertainment.revenue === entRev, 'entertainment revenue matches independent sum');
  assert(cat.sports.revenue + cat.entertainment.revenue === tot.revenue, 'sports + entertainment === total revenue');
  assert(cat.sports.orgs === 4 && cat.entertainment.orgs === 4, '4 sports + 4 entertainment clients');

  // Monthly rollup reconciles to totals (no leakage / double counting).
  const monthly = WP.sales.monthly();
  assert(monthly.length === 12, 'monthly has 12 rows');
  assert(monthly.reduce((a, m) => a + m.events, 0) === tot.events, 'monthly events sum to totals');
  assert(monthly.reduce((a, m) => a + m.revenue, 0) === tot.revenue, 'monthly revenue sums to totals');
  monthly.forEach(m => assert(m.cashless + m.onGround === m.revenue, m.month + ': cashless+onGround === revenue'));

  // Per-org table reconciles + is sorted by revenue desc.
  const byOrg = WP.sales.byOrg();
  assert(byOrg.length === 8, 'byOrg returns all 8 clients');
  assert(byOrg.reduce((a, o) => a + o.revenue, 0) === tot.revenue, 'byOrg revenue sums to totals');
  let sorted = true;
  for (let i = 1; i < byOrg.length; i++) if (byOrg[i - 1].revenue < byOrg[i].revenue) sorted = false;
  assert(sorted, 'byOrg sorted by revenue (desc)');
  byOrg.forEach(o => assert(o.cashless + o.onGround === o.revenue, o.name + ': cashless+onGround === revenue'));

  // Range scoping: last 3 months is a real subset (fewer events than all 12).
  const last3 = WP.sales.months().slice(-3);
  const tot3 = WP.sales.totals(last3);
  assert(tot3.events > 0 && tot3.events < tot.events, 'range scoping (last 3) < all 12');
  assert(WP.sales.monthly(last3).length === 3, 'monthly(range) honours the range');

  // Category filter: totals(category:'sports') reconciles to the category split.
  const totSports = WP.sales.totals(null, { category: 'sports' });
  assert(totSports.revenue === cat.sports.revenue, 'category filter (sports) totals === category split');
  assert(totSports.entertainmentRevenue === 0, 'sports-filtered totals carry no entertainment revenue');
  const totEnt = WP.sales.totals(null, { category: 'entertainment' });
  assert(totSports.revenue + totEnt.revenue === tot.revenue, 'sports + entertainment filters === grand total');

  // Client filter: totals(orgId) matches that client's row in byOrg.
  const topClient = byOrg[0];
  const totClient = WP.sales.totals(null, { orgId: topClient.orgId });
  assert(totClient.revenue === topClient.revenue, 'client filter totals === that client row');
  assert(totClient.orgs === 1, 'client filter yields exactly one org');
  assert(WP.sales.byOrg(null, { orgId: topClient.orgId }).length === 1, 'byOrg(orgId) returns one client');

  // Prior-period window: last 3 has a 3-month window before it; all 12 has none.
  assert(WP.sales.prevWindow(last3).length === 3, 'prevWindow(last 3) is the preceding 3 months');
  assert(WP.sales.prevWindow(WP.sales.months()).length === 0, 'prevWindow(all 12) is empty (no history before)');

  // Anti-fraud math holds: blocked <= flagged <= screened, recovered <= atRisk,
  // and the derived rates land in a sane 0..100 range.
  const fr = WP.sales.fraud();
  assert(fr.rows.length === 12, 'fraud has 12 monthly rows');
  assert(fr.totals.blocked <= fr.totals.flagged && fr.totals.flagged <= fr.totals.screened, 'blocked <= flagged <= screened');
  assert(fr.totals.recovered <= fr.totals.atRisk, 'recovered <= at-risk');
  assert(fr.totals.blockRate >= 0 && fr.totals.blockRate <= 100, 'block rate in 0..100');
  assert(fr.totals.recoveryRate >= 0 && fr.totals.recoveryRate <= 100, 'recovery rate in 0..100');
  assert(fr.totals.fraudRateBps > 0 && fr.totals.fraudRateBps < 200, 'fraud rate is a small bps figure');

  // RBAC: directors/admins/super-admins see it; specialists/managers do not.
  assert(WP.sales.canView({ level: 'director' }) === true, 'director can view');
  assert(WP.sales.canView({ superAdmin: true }) === true, 'super admin can view');
  assert(WP.sales.canView({ level: 'admin' }) === true, 'admin can view');
  assert(WP.sales.canView({ level: 'spec' }) === false, 'specialist cannot view');
  assert(WP.sales.canView({ level: 'manager' }) === false, 'line manager cannot view');
  assert(WP.sales.canView(null) === false, 'no viewer cannot view');

  // i18n keys resolve (EN) and are present in AR.
  assert(WP.i18n.t('navSales') !== 'navSales', 'navSales string exists');
  assert(WP.i18n.t('salesTitle') !== 'salesTitle', 'salesTitle string exists');

  // View render (as the super admin) — EN then AR — produces the real surfaces.
  WP.state.authed = true; WP.state.viewerId = 'p_akram'; WP.state.lang = 'en';
  const host = window.document.createElement('div');
  WP.ui.sales.render(host);
  let out = host.innerHTML;
  assert(/sales-svg/.test(out), 'render: SVG trend chart present');
  assert(/sales-donut/.test(out), 'render: donut charts present');
  assert(/sales-filters/.test(out), 'render: global filter bar present');
  assert(/sales-tc-row/.test(out), 'render: top-clients ranking present');
  assert(/wbk-table/.test(out), 'render: per-client table present');
  assert(/sales-fraud/.test(out), 'render: anti-fraud section present');
  assert(/sales-delta/.test(out), 'render: KPI trend deltas present (has prior period on 6-mo default)');
  assert(out.indexOf(WP.i18n.t('salesTitle')) >= 0, 'render: EN title present');

  WP.state.lang = 'ar';
  WP.ui.sales.render(host);
  out = host.innerHTML;
  assert(out.indexOf('مبيعات الفعاليات') >= 0, 'render: AR title present (RTL)');
  WP.state.lang = 'en';

  // Denied render for a member — no figures, just the gate message.
  WP.state.viewerId = null;   // WP.viewer() → no manager rights
  const denyHost = window.document.createElement('div');
  // Force a non-manager viewer object through the gate directly.
  const origViewer = WP.viewer;
  WP.viewer = () => ({ id: 'x', level: 'spec' });
  WP.ui.sales.render(denyHost);
  WP.viewer = origViewer;
  assert(!/sales-svg/.test(denyHost.innerHTML), 'denied render shows no chart');
  assert(denyHost.innerHTML.indexOf(WP.i18n.t('salesDenied')) >= 0, 'denied render shows the gate message');
} catch (e) {
  errors.push('[throw] ' + e.message + '\n' + e.stack);
}

if (errors.length) {
  console.error('FAIL — verify-sales\n' + errors.join('\n'));
  process.exit(1);
}
console.log('PASS — events sales: engine reconciles to the dataset (totals / category / monthly / per-org), range scoping works, anti-fraud math holds, RBAC gates to director+admin, and the view renders in EN + AR with all four surfaces (trend, split, per-client table, anti-fraud).');
