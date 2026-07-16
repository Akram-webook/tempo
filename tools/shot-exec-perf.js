/* Visual check for the exec-status perf pass:
 *  - no manual Refresh button
 *  - freshness indicator: "Live" (fresh) vs "Updated Xm ago" (stale)
 *  - EN/AR x light/dark
 * Boots the built dist offline, director viewer, stubbed JSONP payload. */
const path = require('path');
const fs = require('fs');
const { chromium } = require(path.join(process.env.HOME, 'tempo-hardening-ux/node_modules/playwright'));

const URL = 'file://' + path.join(__dirname, '..', 'dist', 'index.html');
const OUT = path.join(__dirname, '..', 'docs', 'shots', 'exec-perf');
fs.mkdirSync(OUT, { recursive: true });

function payload(ageMin) {
  return {
    ok: true,
    generatedAt: new Date(Date.now() - ageMin * 60000).toISOString(),
    cover: { done: 7, next: 3, later: 1, total: 11, pct: 64 },
    waves: [
      { wave: 'Wave 1', focus: 'Visibility', status: 'Done', inside: 'Workload map', why: 'See overload', needs: [] },
      { wave: 'Wave 4', focus: 'Intelligence', status: 'Next', inside: 'Weekly report', why: 'Fairer calls', needs: [] },
    ],
    requests: [
      { id: '1', date: new Date(Date.now() - 3 * 86400000).toISOString(), area: 'Org', type: 'Improvement', note: 'Clearer cards', priority: 'Medium', status: 'Done', owner: 'Ahmed' },
      { id: '2', date: new Date().toISOString(), area: 'Exec', type: 'Decision', note: 'Approve wording', priority: 'High', status: 'Needs input', owner: 'Akram' },
    ],
  };
}

async function shot(page, name) { await page.screenshot({ path: path.join(OUT, name) }); }

(async () => {
  const errors = [];
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|favicon/.test(m.text())) errors.push('[console] ' + m.text()); });

  // Intercept the JSONP <script> injection (same approach as verify-exec) and fire
  // the callback with window.__payload — robust vs exec.js capturing jsonp at load.
  await page.addInitScript(() => {
    window.__payload = null;
    const realAppend = Node.prototype.appendChild;
    Node.prototype.appendChild = function (node) {
      if (node && node.tagName === 'SCRIPT' && /callback=/.test(node.src || '')) {
        const cb = decodeURIComponent(node.src.match(/callback=([^&]+)/)[1]);
        Promise.resolve().then(function () { if (window[cb]) window[cb](window.__payload); });
        return node;
      }
      return realAppend.call(this, node);
    };
  });
  await page.goto(URL, { waitUntil: 'networkidle' });

  const dir = await page.evaluate(() => {
    const WP = window.WP;
    const d = (WP.data.PEOPLE || []).find(p => WP.access.canManage(p));
    WP.state.authed = true; WP.state.viewerId = d.id;
    return d.id;
  });
  if (!dir) { console.log('SHOT FAIL — no director'); process.exit(1); }

  async function renderExec(theme, lang, ageMin) {
    await page.evaluate(({ theme, lang, pl }) => {
      const WP = window.WP;
      window.__payload = pl;
      WP.ui.exec._resetCache();       // force a clean load with the chosen age
      WP.state.lang = lang;
      document.documentElement.lang = lang; document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
      WP.setState({ theme: theme, route: 'exec' });
    }, { theme, lang, pl: payload(ageMin) });
    await page.waitForTimeout(500);
  }

  for (const theme of ['dark', 'light']) {
    for (const lang of ['en', 'ar']) {
      const sfx = theme + (lang === 'ar' ? '-ar' : '');
      // fresh => "Live"
      await renderExec(theme, lang, 0);
      await shot(page, 'live-' + sfx + '.png');
      const live = await page.evaluate(() => {
        const f = document.querySelector('.ex-fresh');
        return { hasRefresh: !!document.querySelector('#exec-refresh'), stale: f && f.classList.contains('is-stale'), txt: f && f.textContent };
      });
      if (live.hasRefresh) { console.log('SHOT FAIL — Refresh button still present'); process.exit(1); }
      if (live.stale) { console.log('SHOT FAIL — fresh payload marked stale: ' + JSON.stringify(live)); process.exit(1); }
    }
  }
  // stale => "Updated Xm ago" (one representative shot, EN light)
  await renderExec('light', 'en', 45);
  await shot(page, 'stale-light.png');
  const stale = await page.evaluate(() => {
    const f = document.querySelector('.ex-fresh');
    return { stale: f && f.classList.contains('is-stale'), txt: f && f.textContent };
  });
  if (!stale.stale) { console.log('SHOT FAIL — 45m-old payload not marked stale: ' + JSON.stringify(stale)); process.exit(1); }

  await browser.close();
  if (errors.length) { console.log('SHOT FAIL — JS errors:\n' + errors.join('\n')); process.exit(1); }
  console.log('SHOT OK — no Refresh button; Live (fresh) + Updated-ago (stale); EN/AR x light/dark');
})();
