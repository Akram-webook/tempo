/* Headless verify: the native Executive Status view (live from the Feedback
 * sheet via JSONP) + its entry-point gate. The Executive Status stores no data
 * of its own — it reads WP.config.execStatusEndpoint at view time and renders
 * on-brand inside Tempo; the private Google Slides deck is reached via the
 * "Open / present" button (new tab). Asserts:
 *  - status->color for all 5 buckets;
 *  - "what needs you" derives from requests[] Needs-input (+New/In review),
 *    NOT from waves[].needs;
 *  - cover math (done/total => pct) + proportion bar widths;
 *  - single gate (endpoint set AND admin/director; hidden for member; hidden
 *    when endpoint empty);
 *  - the JSONP loader builds a <script src=…?callback=…> and uses NO fetch/XHR;
 *  - "Open / present" opens the raw deck link in a new tab (noopener, SVG);
 *  - EN + AR; no console errors. */
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const srcs = [...html.matchAll(/src="([^"]+\.js)"/g)].map(m => m[1]);

const dom = new JSDOM('<!doctype html><html><head></head><body><div id="app"></div></body></html>', {
  url: 'https://example.org/tempo/', pretendToBeVisual: true, runScripts: 'outside-only',
});
const { window } = dom;
const errors = [];
const benign = /font|stylesheet|localStorage|Security|scrollIntoView|Not implemented|opaque|insertRule|cssRules|execCommand/i;
['error', 'warn'].forEach(k => {
  const orig = window.console[k].bind(window.console);
  window.console[k] = (...a) => { const s = a.join(' '); if (!benign.test(s)) errors.push('[' + k + '] ' + s); orig(...a); };
});
window.addEventListener('error', e => { if (!benign.test(String(e.message))) errors.push('[onerror] ' + e.message); });
window.HTMLElement.prototype.scrollIntoView = function () {};
window.matchMedia = window.matchMedia || function () { return { matches: false, addEventListener() {}, removeEventListener() {} }; };

// Guard: NO real network. If exec.js ever reaches for fetch/XHR, fail loudly.
window.fetch = function () { errors.push('[net] exec used fetch() — must be JSONP'); return Promise.reject(new Error('no fetch')); };
window.XMLHttpRequest = function () { errors.push('[net] exec used XMLHttpRequest — must be JSONP'); };

for (const s of srcs) {
  const code = fs.readFileSync(path.join(root, s), 'utf8');
  const script = new window.Function(code);
  try { script.call(window); } catch (e) { errors.push('[load ' + s + '] ' + e.message); }
}

const WP = window.WP;
WP.render = function () {};   // neutralize app.js's DOMContentLoaded bootstrap
function assert(c, m) { if (!c) errors.push('[assert] ' + m); }

const REAL_DECK = WP.config.execDeckUrl;
const ENDPOINT = WP.config.execStatusEndpoint;

// A representative payload mirroring the verified response shape.
const PAYLOAD = {
  ok: true,
  generatedAt: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),  // 3h ago
  cover: { done: 6, next: 3, later: 1, total: 10, pct: 60 },
  waves: [
    { wave: 'Wave 3.1', focus: 'Settings', status: 'Done', inside: 'Members; Security; Privacy', why: 'Self-serve', needs: 'SHOULD-BE-IGNORED-FOR-NEEDS' },
    { wave: 'Wave 3.2', focus: 'Exec', status: 'Next', inside: 'Native status', why: 'One click' },
  ],
  requests: [
    { id: 1, area: 'Settings', note: 'Trim my settings', status: 'Done', priority: 'P2' },
    { id: 2, area: 'Layout',   note: 'Full width',       status: 'In progress', priority: 'P1' },
    { id: 3, area: 'Exec',     note: 'Where do I see it', status: 'Needs input', priority: 'P0' },
    { id: 4, area: 'Access',   note: 'New ask',           status: 'New' },
    { id: 5, area: 'Eval',     note: 'Please review',     status: 'In review' },
  ],
};

(async () => {
  try {
    // --- status -> color: all 5 buckets --------------------------------------------
    // DRIFT GUARD: this pins the status->colour bucket contract shared BY NAME
    // with the Google Slides deck (docs/exec-deck/Code.gs, separate Apps Script
    // runtime — cannot import). If either side's regex/buckets change and break
    // these expectations, CI fails here. Keep Code.gs's statusColorKey in sync.
    const ck = WP.execStatus.statusColorKey;
    assert(ck('Done') === 'green' && ck('live') === 'green' && ck('on track') === 'green', 'green bucket');
    assert(ck('In progress') === 'amber' && ck('next') === 'amber' && ck('in review') === 'amber', 'amber bucket');
    assert(ck('Needs input') === 'red' && ck('blocked') === 'red' && ck('needs you') === 'red', 'red bucket');
    assert(ck('Later') === 'violet' && ck('planned') === 'violet' && ck('idea') === 'violet', 'violet bucket');
    assert(ck('') === 'grey' && ck('whatever') === 'grey', 'grey fallback');

    // --- the gate ------------------------------------------------------------------
    WP.can = function (cap) { return cap === 'viewSettings'; };   // admin/director
    assert(WP.execDeckVisible() === true, 'visible for admin/director with endpoint set');
    WP.can = function () { return false; };                       // member
    assert(WP.execDeckVisible() === false, 'hidden for a non-admin');
    WP.can = function (cap) { return cap === 'viewSettings'; };
    const saveEp = WP.config.execStatusEndpoint;
    WP.config.execStatusEndpoint = '   ';
    assert(WP.execDeckVisible() === false, 'hidden when endpoint blank');
    WP.config.execStatusEndpoint = saveEp;

    // --- render: header renders immediately with a loading skeleton + open/present --
    WP.state.lang = 'en';
    const el = window.document.getElementById('app');

    // Intercept the JSONP <script> injection: capture the src + callback, and
    // invoke the callback next tick with the current payload (no network). When
    // failNext is set, fire the script's onerror instead (simulate a failure).
    let injectedSrc = null, curPayload = PAYLOAD, failNext = false;
    const realAppend = window.HTMLHeadElement.prototype.appendChild;
    window.HTMLHeadElement.prototype.appendChild = function (node) {
      if (node && node.tagName === 'SCRIPT' && /callback=/.test(node.src || '')) {
        injectedSrc = node.src;
        const cb = decodeURIComponent(node.src.match(/callback=([^&]+)/)[1]);
        const fail = failNext;
        Promise.resolve().then(function () {
          if (fail) { if (typeof node.onerror === 'function') node.onerror(new window.Event('error')); return; }
          if (window[cb]) window[cb](curPayload);
        });
        return node;   // pretend it was appended
      }
      return realAppend.call(this, node);
    };

    WP.ui.exec.render(el);

    // header present immediately
    assert(el.querySelector('.ex-title'), 'header title renders immediately');
    assert(el.querySelector('.ex-skel'), 'loading skeleton shown while JSONP resolves');
    const open = el.querySelector('#exec-open');
    assert(open && open.tagName === 'A', 'Open/present is an anchor');
    assert(open && open.getAttribute('href') === REAL_DECK, 'Open/present href is the raw deck link');
    assert(open && open.target === '_blank' && /noopener/.test(open.rel) && /noreferrer/.test(open.rel), 'Open/present new tab + noopener/noreferrer');
    assert(open && open.querySelector('svg'), 'Open/present uses an inline SVG icon');
    assert(el.querySelector('#exec-refresh'), 'Refresh button present');

    // the JSONP loader built the right URL
    assert(injectedSrc && injectedSrc.indexOf(ENDPOINT) === 0, 'JSONP script src starts with the endpoint');
    assert(injectedSrc && /[?&]callback=/.test(injectedSrc), 'JSONP script has a ?callback= param');

    // let the callback + paint run
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

    // --- cover math + bar widths ---------------------------------------------------
    const pct = el.querySelector('.ex-pct-n');
    assert(pct && /60%/.test(pct.textContent), 'cover pct renders (60%)');
    const bars = el.querySelectorAll('.ex-bar span');
    assert(bars.length === 3, 'proportion bar has 3 segments');
    assert(bars[0] && /width:\s*60%/.test(bars[0].getAttribute('style')), 'green segment = done/total = 60%');
    assert(bars[1] && /width:\s*30%/.test(bars[1].getAttribute('style')), 'amber segment = next/total = 30%');
    assert(bars[2] && /width:\s*10%/.test(bars[2].getAttribute('style')), 'grey remainder = 10%');

    // --- requests sorted red->amber->green, rollup counts --------------------------
    const rows = el.querySelectorAll('.ex-rows .ex-row');
    assert(rows.length >= 3, 'request rows render');
    const roll = el.querySelector('.ex-roll');
    // done=green(1: "Done"); in-progress=amber("In progress"+"In review"=2); need=red("Needs input"=1); "New"=grey
    assert(roll && /raised 5/.test(roll.textContent) && /1 delivered/.test(roll.textContent) && /2 in progress/.test(roll.textContent) && /1 need/.test(roll.textContent), 'rollup counts (5 raised, 1 delivered, 2 in progress, 1 need input)');

    // --- WHAT NEEDS YOU derives from requests[] (Needs input + New + In review), NOT waves[].needs
    const needs = el.querySelector('.ex-needs');
    assert(needs, 'needs-you section renders when there are open asks');
    assert(needs && /Where do I see it/.test(needs.textContent), 'needs-you includes the Needs-input request');
    assert(needs && /New ask/.test(needs.textContent), 'needs-you includes a New request');
    assert(needs && /Please review/.test(needs.textContent), 'needs-you includes an In-review request');
    assert(!/SHOULD-BE-IGNORED-FOR-NEEDS/.test(el.textContent), 'needs-you does NOT use waves[].needs');

    // --- section ORDER: cover -> needs-you -> requests -> waves (director scan) -----
    const secs = [...el.querySelectorAll('.section')];
    const idxOf = sel => secs.findIndex(s => s.matches(sel) || s.querySelector(sel));
    const iCover = secs.findIndex(s => s.classList.contains('ex-cover'));
    const iNeeds = idxOf('.ex-needs');
    const iReq = idxOf('.ex-rows');
    const iWave = idxOf('.ex-waves');
    assert(iCover === 0, 'cover is first');
    assert(iNeeds > iCover && iNeeds < iReq, 'what-needs-you sits right after the cover, above requests');
    assert(iReq < iWave, 'your requests come before the waves detail');

    // --- waves render --------------------------------------------------------------
    assert(el.querySelectorAll('.ex-wave').length === 2, 'one card per wave');
    assert(/Native status/.test(el.textContent), 'wave "what\'s inside" renders');

    // --- "all clear" when no open asks ---------------------------------------------
    // Swap the interceptor payload to one with only delivered requests.
    curPayload = { ok: true, generatedAt: PAYLOAD.generatedAt,
      cover: { done: 2, next: 0, later: 0, total: 2, pct: 100 },
      waves: [], requests: [{ id: 9, area: 'X', note: 'shipped', status: 'Done' }] };
    el.innerHTML = '';
    WP.ui.exec.render(el);
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    assert(el.querySelector('.ex-clear'), 'calm "all clear" state when nothing needs the director');
    assert(!el.querySelector('.ex-needs'), 'no needs-you list when all clear');
    curPayload = PAYLOAD;   // restore

    // --- error state on JSONP failure ----------------------------------------------
    failNext = true;
    el.innerHTML = '';
    WP.ui.exec.render(el);
    // extra microtask hops: loadJSONP.onerror -> reject -> execStatus.fetch chain -> load().catch
    for (let i = 0; i < 8; i++) await Promise.resolve();
    assert(el.querySelector('.ex-error'), 'error state shown when the endpoint fails');
    assert(el.querySelector('#exec-retry'), 'error state offers Retry');
    failNext = false;

    // --- role gate at the view: a member is bounced --------------------------------
    WP.can = function () { return false; };
    let routed = null; const realSet = WP.setState; WP.setState = function (p) { routed = p; };
    el.innerHTML = '';
    WP.ui.exec.render(el);
    assert(routed && routed.route === 'dashboard', 'a non-admin is redirected to dashboard');
    assert(!el.querySelector('.ex-title'), 'nothing renders for a non-admin');
    WP.setState = realSet;
    WP.can = function (cap) { return cap === 'viewSettings'; };

    // --- AR ------------------------------------------------------------------------
    WP.state.lang = 'ar';
    el.innerHTML = '';
    WP.ui.exec.render(el);
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    assert(/الحالة التنفيذية/.test(el.textContent), 'title localizes to AR');
    const openAr = el.querySelector('#exec-open');
    assert(openAr && /فتح/.test(openAr.textContent), 'Open/present localizes to AR');

    window.HTMLHeadElement.prototype.appendChild = realAppend;
  } catch (e) {
    errors.push('[run] ' + e.message + '\n' + e.stack);
  }

  if (errors.length) { console.log('FAIL\n' + errors.join('\n')); process.exit(1); }
  console.log('PASS — exec status (native): 5-bucket status->color, JSONP loader (script+callback, no fetch/XHR), cover math + bar widths, requests rollup, needs-you from requests[] (not waves.needs), waves render, role gate (admin shows / member bounced / endpoint-empty hidden), Open/present opens the raw deck (new tab, noopener, SVG), EN+AR.');
  process.exit(0);
})();
