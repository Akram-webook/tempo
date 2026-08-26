/* Career Profile (Employee Intelligence) — engine + view invariants.
 * Boots the shell in jsdom, then asserts the spec + ethics contract:
 *  - readiness is a CATEGORICAL stage (ready|nearly|developing|notready) with reasons,
 *    NEVER a numeric score / rank / promote-hold verdict.
 *  - every resolved capability has a status ∈ {ready,developing,notyet}, a labelled
 *    source ∈ {manager,system,configurable}, and evidence — or an honest "unavailable".
 *  - access fails closed: a peer cannot open another person's profile.
 *  - the picker renders for a manager with no selection.
 *  - feedback history is kept (multiple dated entries, newest first).
 *  - new-hire ramp guard: a brand-new person is never "ready"/"nearly".
 *  - EN + AR both render with zero console errors. */
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const srcs = [...html.matchAll(/src="([^"]+\.js)"/g)].map(m => m[1]);
const shellBody = (html.match(/<body[^>]*>([\s\S]*?)<\/body>/) || [, ''])[1].replace(/<script[\s\S]*?<\/script>/g, '');
const dom = new JSDOM('<!doctype html><html><body>' + shellBody + '</body></html>', { url: 'https://localhost/', pretendToBeVisual: true, runScripts: 'outside-only' });
const { window } = dom;
window.HTMLElement.prototype.scrollIntoView = function () {};
window.matchMedia = window.matchMedia || function () { return { matches: false, addEventListener() {}, removeEventListener() {} }; };
window.confirm = function () { return false; }; window.alert = function () {}; window.setInterval = function () { return 0; };
const errors = [];
const benign = /font|stylesheet|localStorage|Security|scrollIntoView|Not implemented|opaque|insertRule|cssRules/i;
['error', 'warn'].forEach(k => { const o = window.console[k].bind(window.console); window.console[k] = (...a) => { const s = a.join(' '); if (!benign.test(s)) errors.push('[' + k + '] ' + s); o(...a); }; });
window.addEventListener('error', e => { if (!benign.test(String(e.message))) errors.push('[onerror] ' + e.message); });
for (const s of srcs) { try { new window.Function(fs.readFileSync(path.join(root, s), 'utf8')).call(window); } catch (e) { errors.push('[load ' + s + '] ' + e.message); } }
const WP = window.WP;
WP.config.cockpitOnly = false;
WP.state.authed = true; WP.state.lang = 'en';
if (WP.data && WP.data.DEMO_TODAY) WP.state.refDate = WP.data.DEMO_TODAY;

function fail(m) { errors.push('[assert] ' + m); }
function ok(c, m) { if (!c) fail(m); }

// ---- engine present ----
ok(WP.career && typeof WP.career.build === 'function', 'WP.career.build missing');
ok(WP.ui && WP.ui.career && typeof WP.ui.career.render === 'function', 'WP.ui.career.render missing');

const READY_KEYS = ['ready', 'nearly', 'developing', 'notready'];
const CAP_ST = ['ready', 'developing', 'notyet'];
const SRC = ['manager', 'system', 'configurable'];
const FORBIDDEN = ['score', 'readinessScore', 'rank', 'ranking', 'pct', 'percentage', 'verdict', 'promote', 'promoteHold'];

// ---- build over the whole growth cohort ----
const cohort = Object.keys((WP.data && WP.data.GROWTH) || {});
ok(cohort.length > 0, 'no GROWTH cohort to test');
cohort.forEach(function (id) {
  let b; try { b = WP.career.build(id, { ar: false }); } catch (e) { return fail('build(' + id + ') threw: ' + e.message); }
  if (!b) return fail('build(' + id + ') returned null');

  // no opaque score / rank / verdict anywhere on the bundle or readiness object
  FORBIDDEN.forEach(function (k) {
    if (Object.prototype.hasOwnProperty.call(b, k)) fail(id + ': bundle exposes forbidden field "' + k + '"');
    if (b.readiness && Object.prototype.hasOwnProperty.call(b.readiness, k)) fail(id + ': readiness exposes forbidden field "' + k + '"');
  });

  // categorical readiness with reasons
  ok(b.readiness && READY_KEYS.indexOf(b.readiness.key) >= 0, id + ': readiness.key not categorical (' + (b.readiness && b.readiness.key) + ')');
  ok(b.readiness && Array.isArray(b.readiness.strong) && Array.isArray(b.readiness.blocking), id + ': readiness reasons missing');

  // caps: valid status + labelled source + evidence-or-honest-absence
  (b.caps || []).forEach(function (c) {
    ok(CAP_ST.indexOf(c.status) >= 0, id + ': cap "' + c.key + '" bad status ' + c.status);
    ok(SRC.indexOf(c.source) >= 0, id + ': cap "' + c.key + '" bad source ' + c.source);
    ok(Array.isArray(c.evidence) && c.evidence.length > 0, id + ': cap "' + c.key + '" has no evidence line');
    if (c.source === 'configurable') {
      const txt = (c.evidence || []).map(e => e.text).join(' ').toLowerCase();
      ok(/unavailable|configurable/.test(txt), id + ': configurable cap "' + c.key + '" must say evidence unavailable, got "' + txt + '"');
    }
  });

  // gaps below target only, each with a concrete action
  (b.gaps || []).forEach(function (g) {
    ok(g.gap > 0, id + ': gap "' + g.name + '" is not below target');
    ok(g.action && g.action.length > 6, id + ': gap "' + g.name + '" missing a concrete action');
  });
});

// ---- new-hire ramp guard: p_idris (joined 2026-05) is never ready/nearly ----
if ((WP.data.GROWTH || {}).p_idris) {
  const bi = WP.career.build('p_idris', {});
  ok(bi && ['developing', 'notready'].indexOf(bi.readiness.key) >= 0, 'p_idris (new hire) should be developing/notready, got ' + (bi && bi.readiness.key));
}

// ---- feedback history kept + newest-first (p_osama has 2 dated entries + quarterly) ----
if ((WP.data.GROWTH || {}).p_osama) {
  const bo = WP.career.build('p_osama', {});
  ok(bo.feedback.length >= 2, 'p_osama should have multiple feedback entries, got ' + bo.feedback.length);
  for (let i = 1; i < bo.feedback.length; i++) {
    const a = bo.feedback[i - 1].date || '', c = bo.feedback[i].date || '';
    ok(a >= c, 'feedback not sorted newest-first (' + a + ' before ' + c + ')');
  }
}

// ---- dev-plan proposal fallback: a person with gaps but no explicit plan gets "proposed" ----
if ((WP.data.GROWTH || {}).p_ibrahim && !((WP.data.CAREER.DEV_PLAN || {}).p_ibrahim)) {
  const bx = WP.career.build('p_ibrahim', {});
  ok(bx.devPlan.length > 0 && bx.devPlan.every(o => o.proposed), 'p_ibrahim dev plan should be proposed from gaps');
}

// ---- skills grouped by the existing framework (p_akram has technical + leadership) ----
if ((WP.data.GROWTH || {}).p_akram) {
  const ba = WP.career.build('p_akram', {});
  ok(ba.skillGroups.technical.length > 0, 'p_akram should have technical skills');
  ok(ba.skillGroups.leadership.length > 0, 'p_akram should have leadership skills');
}

const view = window.document.getElementById('view');

// ---- ACCESS FAIL-CLOSED: a specialist peer cannot open another specialist's profile ----
// p_talal (spec, under p_abdulrahman) viewing p_shamma (spec, under p_abdulrahman) — peers, not manager.
WP.state.viewerId = 'p_talal';
WP.state.route = 'career'; WP.state.selectedId = 'p_shamma';
try { WP.render(); } catch (e) { fail('peer render threw: ' + e.message); }
ok(WP.access.canSee(WP.access.byId('p_talal'), 'p_shamma') === false, 'test premise broken: talal should NOT see shamma');
ok(/access|صلاح/i.test(view.innerHTML), 'peer viewing a non-visible profile must be denied');

// ---- self view renders own profile ----
WP.state.viewerId = 'p_talal'; WP.state.selectedId = 'p_talal';
try { WP.render(); } catch (e) { fail('self render threw: ' + e.message); }
ok(/Career profile|cp-head/i.test(view.innerHTML), 'self should see their own career profile');

// ---- manager with NO selection → picker ----
WP.state.viewerId = 'p_akram'; WP.state.selectedId = null;
try { WP.render(); } catch (e) { fail('picker render threw: ' + e.message); }
ok(/cp-picklist|cp-pick/.test(view.innerHTML), 'manager with no selection should see the person picker');

// ---- manager opening a direct report renders the full profile incl. readiness ----
WP.state.viewerId = 'p_akram'; WP.state.selectedId = 'p_osama';
try { WP.render(); } catch (e) { fail('manager->report render threw: ' + e.message); }
ok(/cp-cap|Promotion readiness/i.test(view.innerHTML), 'manager should see promotion-readiness caps for a report');
// readiness label must NOT be a bare percentage
ok(!/readiness[^<]{0,40}\d+%/i.test(view.innerHTML), 'readiness must not be shown as a percentage');

// ---- AR / RTL renders cleanly ----
WP.state.lang = 'ar';
try { WP.render(); } catch (e) { fail('AR render threw: ' + e.message); }
ok(/الملف المهني|الجاهزية/.test(view.innerHTML), 'AR render should contain Arabic career strings');
WP.state.lang = 'en';

if (errors.length) { console.log('FAIL\n' + errors.join('\n')); process.exit(1); }
console.log('PASS — Career Profile: categorical readiness (no score/rank), sourced evidence, fail-closed access, history kept, EN+AR render clean.');
process.exit(0);
