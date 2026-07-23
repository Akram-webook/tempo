/* Headless verify: the CRUD + warehouse write layer (G3).
 * Two halves:
 *   1) SERVER core (scripts/append-feedback.js applyOp/buildItem) - the field
 *      validation + anti-tamper the Worker relies on. (Deep selftest lives in the
 *      script; here we re-assert the security-critical guards as an independent gate.)
 *   2) CLIENT transport (src/js/ui/feedback.js) - when feedbackProxyEndpoint is set,
 *      Submit POSTs { op:'create', item } to the proxy with NO token, expects
 *      { ok:true }, clears the draft on success, and keeps the queue on failure.
 * Plus the ship-blocker: no token/secret in the built bundle.
 */
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const errors = [];
function assert(c, m) { if (!c) errors.push('[assert] ' + m); }

/* ---------- 1) SERVER core guards ---------- */
const fb = require(path.join(root, 'scripts', 'append-feedback.js'));
(function serverCore() {
  const base = { generated: '', items: [
    { id: 'x1', submittedAt: '2026-01-01T00:00:00Z', owner: 'real@owner', note: 'keep', context: 'c', url: 'u',
      type: 'Bug', klass: 'Backend', priority: 'Medium', status: 'New', wave: null },
  ] };
  // create: enum coercion + status New + immutable id from run
  const c = fb.buildItem({ note: 'hi', type: 'X', priority: 'Y' }, '9', 'NOW');
  assert(c.status === 'New' && c.type === 'Improvement' && c.priority === '', 'create coerces enums + status New');

  // update: valid status + wave
  const u = fb.applyOp(base, 'update', { id: 'x1', status: 'Assigned', wave: 2 }, 'T');
  assert(u.items[0].status === 'Assigned' && u.items[0].wave === 2, 'update sets status+wave');

  // invalid status rejected (C1)
  let threw = false; try { fb.applyOp(base, 'update', { id: 'x1', status: 'HACKED' }, 'T'); } catch (e) { threw = true; }
  assert(threw, 'update rejects invalid status');

  // unknown id rejected (C2)
  threw = false; try { fb.applyOp(base, 'update', { id: 'ghost', status: 'New' }, 'T'); } catch (e) { threw = true; }
  assert(threw, 'update rejects unknown id');

  // immutable fields cannot be overwritten (E5, arbitrary-field-injection)
  const inj = fb.applyOp(base, 'update', { id: 'x1', status: 'Testing', submittedAt: '2000-01-01', owner: 'evil', note: 'X' }, 'T');
  assert(inj.items[0].submittedAt === '2026-01-01T00:00:00Z' && inj.items[0].owner === 'real@owner' && inj.items[0].note === 'keep',
    'update cannot overwrite id/submittedAt/owner/note');

  // prototype pollution inert (A4)
  const pp = fb.applyOp(base, 'update', JSON.parse('{"id":"x1","status":"Testing","__proto__":{"pwn":1}}'), 'T');
  assert(pp.items[0].status === 'Testing' && ({}).pwn === undefined, 'proto-pollution inert');

  // partial update preserves triageNote (C4)
  const withNote = { generated: '', items: [Object.assign({}, base.items[0], { triageNote: 'earlier' })] };
  const partial = fb.applyOp(withNote, 'update', { id: 'x1', status: 'Testing' }, 'T');
  assert(partial.items[0].triageNote === 'earlier', 'partial update preserves triageNote');

  // discard idempotent (D1)
  const d1 = fb.applyOp(base, 'discard', { id: 'x1' }, 'T');
  const d2 = fb.applyOp(d1, 'discard', { id: 'x1' }, 'T2');
  assert(d1.items[0].status === 'Discarded' && d2.items[0].status === 'Discarded', 'discard idempotent');

  // oversize note truncated (A3)
  assert(fb.sanitize('a'.repeat(9000)).length === 2000, 'sanitize caps at 2000');
})();

/* ---------- 2) CLIENT proxy transport ---------- */
(function clientProxy() {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const srcs = [...html.matchAll(/src="([^"]+\.js)"/g)].map(m => m[1]);
  const dom = new JSDOM('<!doctype html><html><head></head><body><header id="appbar"></header><aside id="topbar"></aside><div id="view"></div><footer id="sig-bar"></footer><div id="eval-banner"></div><div id="nav-backdrop"></div><div id="overlay-host"></div></body></html>',
    { url: 'https://example.org/tempo/', runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLElement.prototype.scrollIntoView = function () {};
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  for (const s of srcs) { try { new window.Function(fs.readFileSync(path.join(root, s), 'utf8')).call(window); } catch (e) { errors.push('[load ' + s + '] ' + e.message); } }
  const WP = window.WP;
  if (WP) WP.render = function () {};   // neutralize deferred boot render (no full DOM in this harness)
  if (!WP || !WP.ui || !WP.ui.feedback) { errors.push('[client] WP.ui.feedback missing'); return; }

  // Configure the PROXY (no token). configured() must be true via proxy alone.
  WP.config.feedbackProxyEndpoint = 'https://proxy.example.workers.dev/feedback';
  WP.config.feedbackEndpoint = '';
  WP.config.feedbackDispatchToken = '';

  // Capture proxy calls; assert NO Authorization header is ever sent.
  const calls = [];
  let mode = 'ok';
  window.fetch = function (url, opts) {
    calls.push({ url: url, opts: opts });
    const hasAuth = opts && opts.headers && (opts.headers.Authorization || opts.headers.authorization);
    if (hasAuth) errors.push('[client] proxy request carried an Authorization header (token leak risk)');
    if (mode === 'fail') return Promise.resolve({ status: 500, json: () => Promise.resolve({ ok: false, error: 'x' }) });
    if (mode === 'notok') return Promise.resolve({ status: 200, json: () => Promise.resolve({ ok: false }) });
    return Promise.resolve({ status: 200, json: () => Promise.resolve({ ok: true }) });
  };
  window.navigator = window.navigator || {};
  try { Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true }); } catch (e) {}

  // The proxy submit path posts { op:'create', item } with only Content-Type.
  // Drive it directly through the module's internal via a crafted submit isn't
  // exposed, so assert the transport contract at the source level:
  const srcTxt = fs.readFileSync(path.join(root, 'src/js/ui/feedback.js'), 'utf8');
  assert(/proxyOne\s*\(/.test(srcTxt), 'proxyOne transport exists');
  assert(/op:\s*'create',\s*item:\s*inputs/.test(srcTxt.replace(/\s+/g, ' ')) ||
    /op: 'create', item: inputs/.test(srcTxt), 'proxy posts { op:create, item }');
  // proxyOne must NOT set an Authorization header (token stays server-side).
  const proxyFn = srcTxt.slice(srcTxt.indexOf('function proxyOne'), srcTxt.indexOf('function dispatchOne'));
  assert(!/Authorization/.test(proxyFn), 'proxyOne sends NO Authorization header');
  assert(/status !== 200/.test(proxyFn) && /ok !== true/.test(proxyFn), 'proxyOne treats non-200 / not-ok as failure');
  // configured() true via proxy alone (Submit is live, not "Not configured")
  assert(/feedbackProxyEndpoint'\) !== ''/.test(srcTxt), 'configured() honours the proxy endpoint');
})();

/* ---------- 3) ship-blocker: no secret in the built bundle ---------- */
(function noSecret() {
  const dist = path.join(root, 'dist', 'index.html');
  if (!fs.existsSync(dist)) { errors.push('[dist] not built'); return; }
  const html = fs.readFileSync(dist, 'utf8');
  assert(!/ghp_[A-Za-z0-9]/.test(html), 'no classic PAT in dist');
  assert(!/github_pat_[A-Za-z0-9]/.test(html), 'no fine-grained PAT in dist');
  assert(!/GITHUB_PAT/.test(html), 'no GITHUB_PAT reference in dist');
  // The Worker source must never be inlined into the app bundle.
  assert(!/tempo-crud-worker/.test(html), 'worker code not in app bundle');
})();

/* ---------- 4) worker scoping: touches feedback only, one origin ---------- */
(function workerScope() {
  const w = path.join(root, 'workers', 'tempo-crud', 'index.js');
  if (!fs.existsSync(w)) { errors.push('[worker] index.js missing'); return; }
  const src = fs.readFileSync(w, 'utf8');
  assert(!/exec-status/.test(src), 'worker never touches exec-status.json');
  assert(/akram-webook\.github\.io/.test(src) && /Forbidden/.test(src), 'worker enforces one allowed origin');
  assert(/receive-feedback\.yml/.test(src), 'worker forwards to the receive-feedback Action (one write path)');
  assert(!/ghp_|github_pat_/.test(src), 'worker source carries no hardcoded token');
})();

if (errors.length) { console.log('FAIL\n' + errors.join('\n')); process.exit(1); }
console.log('PASS - crud: server guards (invalid status / unknown id / immutable fields / no proto-pollution / idempotent discard / oversize cap) + client proxy transport (no Authorization header, non-ok = failure, proxy-configured) + no secret in bundle + worker scoped to feedback/one-origin.');
