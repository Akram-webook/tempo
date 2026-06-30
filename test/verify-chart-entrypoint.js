/* Headless verify: the "Full-screen chart" + "Copy link" entry point on the People &
 * workload page header. Renders the map in jsdom, asserts both actions are present and
 * correct (relative href resolves to chart.html, copy writes the absolute URL, toast shown,
 * aria-labels, EN+AR), the standalone export (WP.EMBED) does NOT show them, no console errors. */
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const srcs = [...html.matchAll(/src="([^"]+\.js)"/g)].map(m => m[1]);

const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', {
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

// Clipboard stub that records what was written.
let copied = null;
Object.defineProperty(window.navigator, 'clipboard', {
  configurable: true, value: { writeText: function (s) { copied = s; return Promise.resolve(); } },
});

for (const s of srcs) {
  const code = fs.readFileSync(path.join(root, s), 'utf8');
  const script = new window.Function(code);
  try { script.call(window); } catch (e) { errors.push('[load ' + s + '] ' + e.message); }
}

const WP = window.WP;
// This test renders the map directly; neutralize app.js's deferred DOMContentLoaded
// bootstrap (it renders the full app shell into a mount this minimal DOM lacks).
WP.render = function () {};
function assert(c, m) { if (!c) errors.push('[assert] ' + m); }

(async () => {
  try {
    if (WP.access && WP.access.grantAccess) { try { WP.access.grantAccess('akram@webook.com'); } catch (e) {} }
    WP.state.lang = 'en';
    const el = window.document.getElementById('app');
    WP.ui.workloadMap.render(el);

    // --- both actions present in the PAGE HEADER action slot (reused #45 component) -----
    const fs1 = el.querySelector('.wbk-phead-r .phead-actions #oc-fullscreen');
    const cp1 = el.querySelector('.wbk-phead-r .phead-actions #oc-copylink');
    assert(fs1, 'Full-screen chart action renders in the page header action slot');
    assert(cp1, 'Copy link action renders in the page header action slot');

    // --- "Full-screen chart" is a real link to chart.html, new tab, safe rel -----------
    assert(fs1 && fs1.tagName === 'A', 'Full-screen chart is an anchor (native new-tab link)');
    assert(fs1 && fs1.getAttribute('href') === 'chart.html', 'href is RELATIVE (chart.html) — works on Pages + locally');
    assert(fs1 && fs1.href === 'https://example.org/tempo/chart.html', 'relative href resolves to the sibling chart.html (' + (fs1 && fs1.href) + ')');
    assert(fs1 && fs1.target === '_blank', 'opens in a new tab');
    assert(fs1 && /noopener/.test(fs1.rel) && /noreferrer/.test(fs1.rel), 'rel is noopener noreferrer');
    assert(fs1 && fs1.getAttribute('aria-label'), 'Full-screen chart has an aria-label');
    assert(fs1 && fs1.querySelector('svg'), 'Full-screen chart uses an inline SVG icon (no emoji)');
    assert(cp1 && cp1.getAttribute('aria-label'), 'Copy link has an aria-label');
    assert(cp1 && cp1.querySelector('svg'), 'Copy link uses an inline SVG icon (no emoji)');

    // --- Copy link writes the ABSOLUTE chart.html URL + shows the shared toast ----------
    copied = null;
    cp1.click();
    await Promise.resolve(); await Promise.resolve();
    const expected = new window.URL('chart.html', window.location.href).href;
    assert(copied === expected, 'Copy link writes the absolute chart.html URL (' + copied + ')');
    const toast = window.document.getElementById('wbk-toast-host');
    assert(toast && /copied|نسخ/i.test(toast.textContent), 'a confirmation toast is shown (reused .wbk-toast)');

    // --- the standalone export (WP.EMBED) does NOT render the entry actions ------------
    WP.EMBED = true;
    WP.ui.workloadMap.render(el);
    assert(!el.querySelector('#oc-fullscreen') && !el.querySelector('#oc-copylink'), 'WP.EMBED export omits the entry actions (no header) — export render unchanged');
    WP.EMBED = false;

    // --- AR labels present (RTL mirroring is handled by the header flex, no custom CSS) --
    WP.state.lang = 'ar';
    WP.ui.workloadMap.render(el);
    const fsAr = el.querySelector('#oc-fullscreen'), cpAr = el.querySelector('#oc-copylink');
    assert(fsAr && /ملء الشاشة/.test(fsAr.textContent), 'Full-screen chart label localizes to AR');
    assert(cpAr && /نسخ الرابط/.test(cpAr.textContent), 'Copy link label localizes to AR');
  } catch (e) {
    errors.push('[run] ' + e.message + '\n' + e.stack);
  }

  if (errors.length) { console.log('FAIL\n' + errors.join('\n')); process.exit(1); }
  console.log('PASS — chart entry point: Full-screen chart + Copy link render in the page header (reused pageHeader action slot + SVG icons), the link resolves to chart.html (new tab, noopener), Copy writes the absolute URL and shows the reused toast, the WP.EMBED export omits them (unchanged), EN+AR.');
  process.exit(0);
})();
