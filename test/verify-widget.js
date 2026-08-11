/* Headless verify: the Phase 2 embeddable Global Feedback widget
 * (src/js/widget/index.js -> dist/widget.js).
 *
 * Three parts:
 *   1) BEHAVIOUR — boot the widget in jsdom (as a foreign host would) and drive the
 *      Phase 2 attack matrix (P2-A1..A12): init guards, single FAB, submit contract
 *      (op:'create', item with auto source/url, NO Authorization header), success +
 *      rollback, destroy/re-init, double-init.
 *   2) SECURITY GREPS — the shipped dist/widget.js carries no token, no endpoint, no
 *      secret; the widget source uses CSS custom properties (no raw hex); the proxy
 *      CORS is a hard-coded Set and never touches exec-status.
 *   3) TRIAGE — exec.js gained a Source filter + badge over `toolSource`, WITHOUT
 *      conflating it with the existing `source:'feedback'` pipeline flag (BUG-001).
 */
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const errors = [];
function assert(c, m) { if (!c) errors.push('[assert] ' + m); }

const WIDGET_SRC = path.join(root, 'src', 'js', 'widget', 'index.js');
const DIST_WIDGET = path.join(root, 'dist', 'widget.js');
const PROXY = path.join(root, 'supabase', 'functions', 'feedback-proxy', 'index.ts');
const EXEC = path.join(root, 'src', 'js', 'ui', 'exec.js');

/* ---------- 1) BEHAVIOUR (jsdom, foreign host) ---------- */
const behaviourDone = (function behaviour() {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>',
    { url: 'https://hr-portal.webook.com/dashboard', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  const document = window.document;
  // console.error capture (init guards must LOG, not fail silently).
  const consoleErrors = [];
  window.console.error = (...a) => consoleErrors.push(a.join(' '));
  // fetch + AbortController doubles.
  const fetchState = { calls: [], next: null };
  window.fetch = function (url, opts) {
    fetchState.calls.push({ url, opts: opts || {} });
    return fetchState.next ? fetchState.next(url, opts || {}) : Promise.reject(new Error('no handler'));
  };
  if (!window.AbortController) window.AbortController = function () { this.signal = {}; this.abort = function () {}; };
  try { Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true }); } catch (e) {}

  // Load the widget source exactly as a <script> would.
  const code = fs.readFileSync(WIDGET_SRC, 'utf8');
  try { new window.Function(code).call(window); } catch (e) { errors.push('[load widget] ' + e.message); return; }

  const FB = window.WBK && window.WBK.Feedback;
  assert(!!FB && typeof FB.init === 'function' && typeof FB.destroy === 'function', 'window.WBK.Feedback.init/destroy exist');
  const fab = () => document.querySelectorAll('.wbkfb-fab');

  // P2-A10: bundle loaded, no init() -> no FAB, no console errors.
  assert(fab().length === 0, 'no FAB before init()');
  assert(consoleErrors.length === 0, 'no console errors merely from loading the bundle');

  // P2-A3: init() with no tool -> refuses to mount, logs error, NO DOM.
  assert(FB.init({ endpoint: 'https://proxy.example/fn' }) === false, 'init without tool returns false');
  assert(fab().length === 0, 'no FAB injected without a tool');
  assert(consoleErrors.some(m => /tool/i.test(m)), 'missing tool logs a clear error');

  // P2-A9: endpoint empty/missing -> config error, no silent failure, no DOM.
  consoleErrors.length = 0;
  assert(FB.init({ tool: 'hr-portal' }) === false, 'init without endpoint returns false');
  assert(FB.init({ tool: 'hr-portal', endpoint: '   ' }) === false, 'init with blank endpoint returns false');
  assert(fab().length === 0, 'no FAB injected without an endpoint');
  assert(consoleErrors.some(m => /endpoint/i.test(m)), 'missing endpoint logs a clear config error');

  // Valid init -> exactly one FAB, labelled.
  const ok = FB.init({ tool: 'HR Portal', endpoint: 'https://proxy.example/fn', locale: 'en' });
  assert(ok === true, 'valid init returns true');
  assert(fab().length === 1, 'exactly one FAB after valid init');
  assert(fab()[0].getAttribute('aria-label'), 'FAB has an aria-label');

  // P2-A4: init() twice -> still exactly one FAB (clean replace, no ghost).
  FB.init({ tool: 'hr-portal', endpoint: 'https://proxy.example/fn' });
  assert(fab().length === 1, 'init twice does not create a duplicate FAB');

  // Open the panel + submit. Assert the create contract + auto fields + no auth header.
  fab()[0].click();
  const overlay = document.querySelector('.wbkfb-overlay');
  assert(!!overlay, 'clicking the FAB opens the panel');
  assert(overlay.querySelector('.wbkfb-panel').getAttribute('role') === 'dialog', 'panel is role=dialog');

  // Empty note -> no fetch (note required).
  fetchState.calls = []; fetchState.next = () => Promise.resolve({ status: 200, json: () => Promise.resolve({ ok: true }) });
  overlay.querySelector('.wbkfb-send').click();
  assert(fetchState.calls.length === 0, 'empty note does not submit');

  // Fill note + submit; server says ok.
  const note = overlay.querySelector('#wbkfb-note');
  note.value = 'The leave request form is confusing';
  note.dispatchEvent(new window.Event('input', { bubbles: true }));
  overlay.querySelector('.wbkfb-send').click();

  return new Promise((resolve) => {
    setTimeout(() => {
      const call = fetchState.calls[fetchState.calls.length - 1];
      assert(!!call, 'submit fired a fetch');
      if (call) {
        assert(call.url === 'https://proxy.example/fn', 'submit POSTs to the init endpoint');
        const h = call.opts.headers || {};
        assert(!h.Authorization && !h.authorization, 'submit carries NO Authorization header (token stays server-side)');
        assert(h['Content-Type'] === 'application/json', 'submit is JSON');
        let body = null; try { body = JSON.parse(call.opts.body); } catch (e) {}
        assert(body && body.op === 'create' && body.item, "submit body is { op:'create', item }");
        // P2-A6: source = the tool slug (auto). url = location.href (auto).
        assert(body.item.source === 'hr-portal', 'item.source is the tool slug (auto, slugified)');
        assert(body.item.url === 'https://hr-portal.webook.com/dashboard', 'item.url is auto-populated from location.href');
        assert(body.item.note === 'The leave request form is confusing', 'item.note carries the typed text');
        assert('type' in body.item && 'submittedAt' in body.item, 'item carries type + submittedAt');
      }
      // success closed the panel.
      assert(!document.querySelector('.wbkfb-overlay'), 'panel closes after a successful submit');

      // Rollback on failure: open, submit, server 500 -> panel stays, data kept, send re-enabled.
      fab()[0].click();
      const ov2 = document.querySelector('.wbkfb-overlay');
      const n2 = ov2.querySelector('#wbkfb-note');
      n2.value = 'second note'; n2.dispatchEvent(new window.Event('input', { bubbles: true }));
      fetchState.next = () => Promise.resolve({ status: 500, json: () => Promise.resolve({ ok: false }) });
      ov2.querySelector('.wbkfb-send').click();
      setTimeout(() => {
        assert(!!document.querySelector('.wbkfb-overlay'), 'panel stays open on submit failure (rollback)');
        assert(document.querySelector('#wbkfb-note').value === 'second note', 'typed note is preserved on failure (never lose work)');
        assert(document.querySelector('.wbkfb-send').disabled === false, 'send button re-enabled after failure');

        // P2-A5: destroy() removes all DOM; re-init works with no ghost.
        FB.destroy();
        assert(document.querySelectorAll('.wbkfb-fab').length === 0, 'destroy removes the FAB');
        assert(document.querySelectorAll('.wbkfb-overlay').length === 0, 'destroy removes the panel');
        assert(document.querySelectorAll('style[data-wbkfb]').length === 0, 'destroy removes the injected style');
        const re = FB.init({ tool: 'finance-hub', endpoint: 'https://proxy.example/fn' });
        assert(re === true && document.querySelectorAll('.wbkfb-fab').length === 1, 're-init after destroy works, single FAB');
        FB.destroy();
        resolve();
      }, 5);
    }, 5);
  });
})();

/* ---------- 2) SECURITY GREPS (P2-A11 + the updated grep set) ---------- */
(function security() {
  const widgetSrc = fs.readFileSync(WIDGET_SRC, 'utf8');
  const dist = fs.existsSync(DIST_WIDGET) ? fs.readFileSync(DIST_WIDGET, 'utf8') : '';
  const proxy = fs.readFileSync(PROXY, 'utf8');
  assert(!!dist, 'dist/widget.js is built');
  // 1 + 2: no PAT / secret / bearer in the widget bundle or source.
  assert(!/github_pat_|ghp_|Bearer|GITHUB_PAT/.test(dist), 'no PAT/Bearer/secret in dist/widget.js');
  assert(!/github_pat_|ghp_|Bearer|GITHUB_PAT/.test(widgetSrc), 'no PAT/Bearer/secret in widget source');
  // 3 + P2-A11: endpoint is never baked in (no supabase.co URL in the bundle).
  assert(!/supabase\.co/.test(dist), 'no Supabase endpoint baked into dist/widget.js (comes from init config)');
  // 6: token purity — no raw 6-hex anywhere in the widget source (CSS vars + rgb only).
  assert(!/#[0-9a-fA-F]{6}\b/.test(widgetSrc), 'no raw #hex in the widget source (CSS custom properties / rgb only)');
  // 4: CORS is a hard-coded Set, never a reflected origin.
  assert(/const ALLOWED_ORIGINS = new Set/.test(proxy), 'proxy CORS is a hard-coded ALLOWED_ORIGINS Set');
  assert(/ALLOWED_ORIGINS\.has\(origin\)/.test(proxy), 'proxy gates by Set membership (not origin reflection)');
  // 5: proxy never touches exec-status.
  assert(!/exec-status/.test(proxy), 'proxy never references exec-status');
  // dist is the from-source build (banner + source), so the two must agree on content.
  assert(dist.indexOf(widgetSrc) >= 0, 'dist/widget.js is the from-source build (contains the source verbatim)');
})();

/* ---------- 3) TRIAGE (exec.js: Source filter + badge, no conflation) ---------- */
(function triage() {
  const src = fs.readFileSync(EXEC, 'utf8');
  assert(/function matchesSource/.test(src), 'exec has a matchesSource() filter');
  assert(/filterSource/.test(src), 'exec tracks a filterSource state');
  assert(/execFilterSource/.test(src), 'Source filter group is rendered (execFilterSource label)');
  assert(/ex-tl-tag--src/.test(src), 'each feedback row carries a source badge (.ex-tl-tag--src)');
  assert(/toolSource/.test(src), 'exec carries a distinct toolSource field for the tool source');
  // BUG-001 regression: the pipeline flag `source:'feedback'` must NOT be conflated
  // with the new tool source — both concepts still present and separate.
  assert(/source !== 'feedback'/.test(src), "the pipeline source flag (source !== 'feedback') is intact (BUG-001)");
  assert(/source: 'feedback'/.test(src), "feedback rows are still tagged source:'feedback' (pipeline lane)");
  // Migration: a raw item with no source reads as 'workload', never rewritten.
  assert(/it\.source \? String\(it\.source\) : 'workload'/.test(src), "missing source coalesces to 'workload' at read time (no rewrite)");
})();

// Await the async behaviour block (its timers) before reporting.
(async () => {
  await behaviourDone;
  if (errors.length) { console.log('FAIL — verify-widget:\n' + errors.join('\n')); process.exit(1); }
  console.log('PASS — widget (Phase 2): embeddable window.WBK.Feedback (init/destroy) — refuses to mount without tool/endpoint (logs, no DOM); single FAB, clean double-init + destroy/re-init; submit = { op:create, item } to init endpoint, auto source(slug)+url, NO Authorization header, success closes + failure rolls back keeping the note; dist/widget.js carries no token/endpoint/secret + no raw hex + from-source; proxy CORS = hard-coded Set (no reflection), no exec-status; exec triage Source filter + badge over toolSource without conflating source:feedback (BUG-001).');
})();
