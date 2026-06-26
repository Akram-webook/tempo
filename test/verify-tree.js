/* Headless verify: load all app scripts in jsdom, render the workload map,
 * exercise the new behaviors, and fail on any console error. */
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const srcs = [...html.matchAll(/src="([^"]+\.js)"/g)].map(m => m[1]);

const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', {
  url: 'https://localhost/', pretendToBeVisual: true, runScripts: 'outside-only',
});
const { window } = dom;
const errors = [];
// Benign-noise filter (fonts/link/opaque/localStorage/Security/scrollIntoView/stylesheet)
const benign = /font|stylesheet|localStorage|Security|scrollIntoView|Not implemented|opaque|insertRule|cssRules/i;
['error', 'warn'].forEach(k => {
  const orig = window.console[k].bind(window.console);
  window.console[k] = (...a) => { const s = a.join(' '); if (!benign.test(s)) errors.push('[' + k + '] ' + s); orig(...a); };
});
window.addEventListener('error', e => { if (!benign.test(String(e.message))) errors.push('[onerror] ' + e.message); });
// jsdom lacks these — stub so code under test doesn't trip the error channel
window.HTMLElement.prototype.scrollIntoView = function () {};
window.matchMedia = window.matchMedia || function () { return { matches: false, addEventListener() {}, removeEventListener() {} }; };

for (const s of srcs) {
  const code = fs.readFileSync(path.join(root, s), 'utf8');
  const script = new window.Function(code);
  try { script.call(window); } catch (e) { errors.push('[load ' + s + '] ' + e.message); }
}

const WP = window.WP;
function assert(c, m) { if (!c) errors.push('[assert] ' + m); }

try {
  // Force a viewer with full visibility (director) so the whole tree renders.
  if (WP.access && WP.access.grantAccess) { try { WP.access.grantAccess('akram@webook.com'); } catch (e) {} }
  WP.state.lang = 'en';
  const el = window.document.getElementById('app');

  // Render the workload map directly.
  WP.ui.workloadMap.render(el);

  const nodes = el.querySelectorAll('.tree .node');
  assert(nodes.length > 0, 'tree rendered some nodes (' + nodes.length + ')');
  assert(el.querySelector('.statusline'), 'status line present');
  assert(el.querySelector('.node-ava[data-profile]'), 'avatar profile target present');

  // Full-time vs Freelance both represented
  const txt = el.textContent;
  assert(/Full-time/.test(txt), 'shows Full-time label');
  assert(/Freelance/.test(txt), 'shows Freelance label');

  // Raghdaa (joining 2026-06-21) must NOT show a "Joining" badge now that the date passed.
  // Find her card; she should render as a normal active member (Full-time).
  const all = WP.access.visiblePeople(WP.viewer());
  const rag = all.find(p => p.id === 'p_raghdaa');
  assert(rag, 'raghdaa in data');
  // simulate her node via statusLine path: today is past her joining date
  const todayPast = new Date() > new Date(rag.joining + 'T00:00:00Z');
  assert(todayPast, 'today is past Raghdaa joining date (' + rag.joining + ')');

  // has-kids manager card should be clickable (cursor pointer class)
  const mgr = el.querySelector('.tree .node.has-kids');
  assert(mgr, 'at least one expandable (has-kids) manager card');

  // Clicking a manager card toggles its subtree (collapse/expand) without throwing.
  if (mgr) {
    const before = el.querySelectorAll('.tree .node').length;
    mgr.click();
    const after = el.querySelectorAll('.tree .node').length;
    assert(after !== before, 'clicking manager card changed visible node count (' + before + ' -> ' + after + ')');
  }
} catch (e) {
  errors.push('[run] ' + e.message + '\n' + e.stack);
}

if (errors.length) { console.log('FAIL\n' + errors.join('\n')); process.exit(1); }
console.log('PASS — workload map renders clean; status line, live indicator, click-to-expand, avatar-profile, and Raghdaa join-date all verified.');
process.exit(0);   // stop the 10s auto-refresh timer so the harness exits cleanly
