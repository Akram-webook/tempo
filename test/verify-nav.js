/* Regression: the Workload auto-refresh timer must NOT repaint the map over another
 * page after navigation. Capture the interval callback, navigate away, fire it,
 * and assert the active page is untouched. */
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const srcs = [...html.matchAll(/src="([^"]+\.js)"/g)].map(m => m[1]);

// Build the real app shell (#view etc.) so the router renders into the shared container.
const shellBody = (html.match(/<body[^>]*>([\s\S]*?)<\/body>/) || [, ''])[1].replace(/<script[\s\S]*?<\/script>/g, '');
const dom = new JSDOM('<!doctype html><html><body>' + shellBody + '</body></html>', { url: 'https://localhost/', pretendToBeVisual: true, runScripts: 'outside-only' });
const { window } = dom;
window.HTMLElement.prototype.scrollIntoView = function () {};
window.matchMedia = window.matchMedia || function () { return { matches: false, addEventListener() {}, removeEventListener() {} }; };
try { window.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} }; } catch (e) {}

// Capture interval callbacks instead of running them on a real clock.
const intervals = [];
window.setInterval = function (fn) { intervals.push(fn); return intervals.length; };
window.clearInterval = function (id) { if (id) intervals[id - 1] = null; };

const errors = [];
for (const s of srcs) { try { new window.Function(fs.readFileSync(path.join(root, s), 'utf8')).call(window); } catch (e) { errors.push('[load ' + s + '] ' + e.message); } }
const WP = window.WP;
function assert(c, m) { if (!c) errors.push('[assert] ' + m); }

try {
  WP.setState && WP.setState({ authed: true });
  WP.state.authed = true;
  WP.state.lang = 'en';
  // Land on the Workload map (route 'map') and render via the real router.
  WP.state.route = 'map';
  WP.render();
  const view = window.document.getElementById('view');
  assert(view.querySelector('.controlbar'), 'map rendered (controlbar present)');
  assert(intervals.filter(Boolean).length >= 1, 'auto-refresh timer was scheduled on the map');
  const cb = intervals.filter(Boolean).slice(-1)[0];

  // Navigate to Evaluations.
  WP.state.route = 'evaluations';
  WP.render();
  const hadEvalMarker = !view.querySelector('.controlbar');  // map toolbar gone
  assert(hadEvalMarker, 'evaluations replaced the map content');
  const snapshot = view.innerHTML;

  // Fire the stale workload timer callback — it must NOT repaint the map.
  if (cb) cb();
  assert(!view.querySelector('.controlbar'), 'BUG would be: map toolbar reappeared over Evaluations');
  assert(view.innerHTML === snapshot, 'Evaluations page untouched after stale timer fired');
} catch (e) { errors.push('[run] ' + e.message + '\n' + e.stack); }

if (errors.length) { console.log('FAIL\n' + errors.join('\n')); process.exit(1); }
console.log('PASS — auto-refresh no longer hijacks other pages; navigating to Evaluations stays put.');
process.exit(0);
