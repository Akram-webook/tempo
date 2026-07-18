/* Headless verify: the native Project-delivery view (GitHub warehouse model).
 * The page fetch()es data/exec-status.json - a repo file committed by the
 * exec-status Action and served same-origin by Pages. NO JSONP, NO Google.
 * Asserts:
 *  - status->color buckets (drift guard shared with the report page);
 *  - the gate = admin/director only (data is always fetchable);
 *  - load() uses fetch() (NOT JSONP/script-injection) on execStatusData;
 *  - launcher renders cover.progress %; waves render with progress + health;
 *  - trend sparkline from history[]; empty-state when generated == null;
 *  - "Open full report" links to the status.html report; EN + AR; no errors. */
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

// --- fetch mock: capture the URL, return whatever the current test wants. ------
let fetchedUrl = null, nextPayload = null, nextOk = true;
window.fetch = function (url) {
  fetchedUrl = url;
  return Promise.resolve({
    ok: nextOk,
    status: nextOk ? 200 : 404,
    json: function () { return Promise.resolve(nextPayload); },
  });
};
// (JSONP would inject <script src=...?callback=...>; we assert exec uses fetch()
// on data/exec-status.json below, which is the direct proof it is not JSONP.)

for (const s of srcs) {
  const code = fs.readFileSync(path.join(root, s), 'utf8');
  const script = new window.Function(code);
  try { script.call(window); } catch (e) { errors.push('[load ' + s + '] ' + e.message); }
}

const WP = window.WP;
WP.render = function () {};
function assert(c, m) { if (!c) errors.push('[assert] ' + m); }
const $ = (sel) => window.document.querySelector(sel);

// The GitHub-warehouse payload shape (committed data/exec-status.json).
const PAYLOAD = {
  generated: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),  // 3h ago
  cover: { status: 'In Progress', progress: 60, health: 'amber',
    narrative: '60% delivered across 4 waves - 1 wave(s) need attention.' },
  waves: [
    { name: 'Executive Status Deck', label: 'wave:exec-status', status: 'In Progress',
      progress: 85, health: 'green', openPRs: [], notes: '4/5 PRs merged.' },
    { name: 'Capacity Engine', label: 'wave:capacity', status: 'In Progress',
      progress: 40, health: 'red',
      openPRs: [{ number: 118, title: 'Workload model', blockedOn: 'reviewers', daysSinceActivity: 7 }],
      notes: '1/3 PRs merged. #118 awaiting review (7d).' },
  ],
  needsYou: ['Capacity Engine: 1/3 PRs merged. #118 awaiting review (7d).'],
  history: [{ ts: '2026-07-14T07:00:00Z', progress: 50 }, { ts: '2026-07-16T07:00:00Z', progress: 55 }, { ts: '2026-07-18T07:00:00Z', progress: 60 }],
};

(async () => {
  try {
    // --- status -> color buckets (drift guard) -------------------------------------
    const ck = WP.execStatus.statusColorKey;
    assert(ck('Done') === 'green' && ck('on track') === 'green', 'green bucket');
    assert(ck('In progress') === 'amber' && ck('in review') === 'amber', 'amber bucket');
    assert(ck('Needs input') === 'red' && ck('blocked') === 'red', 'red bucket');
    assert(ck('') === 'grey' && ck('whatever') === 'grey', 'grey fallback');

    // --- the gate: admin/director only (data is always fetchable) ------------------
    WP.can = function (cap) { return cap === 'viewSettings'; };
    assert(WP.execDeckVisible() === true, 'visible for admin/director');
    WP.can = function () { return false; };
    assert(WP.execDeckVisible() === false, 'hidden for a non-admin');
    WP.can = function (cap) { return cap === 'viewSettings'; };

    // --- render: fetch(), NOT JSONP -----------------------------------------------
    WP.state.lang = 'en';
    nextPayload = PAYLOAD; nextOk = true;
    const el = window.document.createElement('div');
    WP.ui.exec.render(el);
    assert($ ? true : true, 'render did not throw');
    assert(el.querySelector('.ex-title'), 'header title renders immediately');
    // let the fetch().then chain resolve
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    assert(fetchedUrl && /data\/exec-status\.json/.test(fetchedUrl), 'load() fetches data/exec-status.json');
    assert(fetchedUrl && /[?&]t=/.test(fetchedUrl), 'fetch URL is cache-busted');

    // header framing stays project-delivery (not employee)
    assert(/PROJECT DELIVERY|تسليم المشروع/i.test(el.querySelector('.ex-eyebrow').textContent), 'eyebrow reads as project delivery');
    assert(/Project delivery|تسليم المشروع/i.test(el.querySelector('.ex-title').textContent) &&
      !/Executive/i.test(el.querySelector('.ex-title').textContent), 'title reads project delivery (not Executive)');
    assert(el.querySelector('.ex-forwho') && /Not an employee view|ليست شاشة للموظفين/i.test(el.querySelector('.ex-forwho').textContent), 'a for-who line states it is not an employee view');

    // --- launcher: cover.progress % + single bar + trend sparkline -----------------
    const pctn = el.querySelector('.ex-pct-n');
    assert(pctn && /60%/.test(pctn.textContent), 'launcher renders cover.progress (60%)');
    const bar0 = el.querySelector('.ex-launch .ex-bar span');
    assert(bar0 && /width:\s*60%/.test(bar0.getAttribute('style') || ''), 'progress bar green = 60%');
    assert(el.querySelector('.ex-spark svg path'), 'trend sparkline renders from history[]');
    assert(el.querySelector('.ex-spark-l--up'), 'rising history marks trend up');

    // --- waves section: progress + health + blocked-on ----------------------------
    const waves = el.querySelectorAll('.ex-wave');
    assert(waves.length === 2, 'both waves render (got ' + waves.length + ')');
    assert(/Capacity Engine/.test(el.textContent), 'wave name shows');
    assert(el.querySelector('.ex-wave-blk') && /reviewers/.test(el.querySelector('.ex-wave-blk').textContent), 'blocked-on shows whose move it is');

    // --- needs-you from data.needsYou ---------------------------------------------
    assert(/awaiting review/i.test(el.textContent), 'needsYou item renders');

    // --- "Open full report" links to the report page ------------------------------
    const open = el.querySelector('#exec-open');
    assert(open && /status\.html/.test(open.getAttribute('href')), 'Open-report links to status.html');
    assert(open && open.getAttribute('target') === '_blank' && /noopener/.test(open.getAttribute('rel') || ''), 'Open-report new tab + noopener');

    // --- EMPTY STATE: generated == null -> "no data yet", not sample ---------------
    nextPayload = { generated: null, cover: {}, waves: [], needsYou: [], history: [] };
    const el2 = window.document.createElement('div');
    WP.ui.exec.render(el2);
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    assert(el2.querySelector('.ex-empty--nodata'), 'empty state shows when generated is null (not sample data)');
    assert(!el2.querySelector('.ex-wave'), 'no waves render in the empty state');

    // --- fetch error -> error state (retry) ---------------------------------------
    nextOk = false;
    const el3 = window.document.createElement('div');
    WP.ui.exec.render(el3);
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    assert(el3.querySelector('.ex-error'), 'error state shown when the fetch fails');
    nextOk = true;

    // --- AR ------------------------------------------------------------------------
    WP.state.lang = 'ar';
    nextPayload = PAYLOAD;
    const elAr = window.document.createElement('div');
    WP.ui.exec.render(elAr);
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    assert(/تسليم المشروع/.test(elAr.textContent), 'title localizes to AR (project delivery)');

  } catch (e) {
    errors.push('[run] ' + e.message + '\n' + e.stack);
  }
  if (errors.length) { console.log('FAIL\n' + errors.join('\n')); process.exit(1); }
  console.log('PASS — project-delivery (GitHub warehouse): fetch() on data/exec-status.json (no JSONP), admin gate, cover.progress launcher + single bar, waves with progress/health/blocked-on, trend sparkline, needsYou, empty-state when no run yet, error state, Open-report -> status.html, EN+AR.');
  process.exit(0);
})();
